import fs from "fs";
import path from "path";

import type {
  ComposerJson,
  DetectionContext,
  PackageJson,
} from "./types.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const ROOT_MARKERS = [
  "package.json",
  "composer.json",
  "pubspec.yaml",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
  "Package.swift",
  "angular.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "nuxt.config.js",
  "nuxt.config.ts",
  "astro.config.js",
  "astro.config.mjs",
  "astro.config.ts",
  "wp-config.php",
  "artisan",
  "manage.py",
  "app.py",
  "index.html",
  "index.php",
] as const;

const PREFERRED_CHILD_DIRECTORIES = [
  "frontend",
  "client",
  "web",
  "app",
  "apps/web",
  "packages/web",
] as const;

export function createDetectionContext(inputPath: string = process.cwd()): DetectionContext {
  const projectPath = resolveProjectRoot(inputPath);
  const { files, directories } = scanProject(projectPath);
  const packageJson = readJson<PackageJson>(path.join(projectPath, "package.json"));
  const composerJson = readJson<ComposerJson>(path.join(projectPath, "composer.json"));
  const pubspec = readYamlLike(path.join(projectPath, "pubspec.yaml"));

  const normalize = (relativePath: string): string => toPosix(relativePath).replace(/^\/+/, "");
  const absolute = (relativePath: string): string => path.join(projectPath, normalize(relativePath));

  return {
    inputPath: path.resolve(inputPath),
    projectPath,
    files,
    directories,
    packageJson,
    composerJson,
    pubspec,
    hasFile(relativePath) {
      return files.has(normalize(relativePath));
    },
    hasAnyFile(relativePaths) {
      return relativePaths.some((relativePath) => this.hasFile(relativePath));
    },
    hasDirectory(relativePath) {
      return directories.has(normalize(relativePath));
    },
    hasAnyDirectory(relativePaths) {
      return relativePaths.some((relativePath) => this.hasDirectory(relativePath));
    },
    findFile(predicate) {
      return [...files].find(predicate);
    },
    readText(relativePath) {
      try {
        return fs.readFileSync(absolute(relativePath), "utf8");
      } catch {
        return undefined;
      }
    },
    dependencyVersion(packageName) {
      const dependencyGroups = [
        packageJson?.dependencies,
        packageJson?.devDependencies,
        packageJson?.peerDependencies,
        packageJson?.optionalDependencies,
      ];

      for (const group of dependencyGroups) {
        const version = group?.[packageName];
        if (version) return cleanVersion(version);
      }

      return undefined;
    },
    composerDependencyVersion(packageName) {
      const version =
        composerJson?.require?.[packageName] ??
        composerJson?.["require-dev"]?.[packageName];

      return version ? cleanVersion(version) : undefined;
    },
  };
}

export function resolveProjectRoot(inputPath: string = process.cwd()): string {
  const start = path.resolve(inputPath);
  const stats = safeStat(start);
  const basePath = stats?.isFile() ? path.dirname(start) : start;
  const candidates = collectRootCandidates(basePath);

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreRootCandidate(candidate, basePath) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.length - b.candidate.length);

  return scored[0]?.candidate ?? basePath;
}

function collectRootCandidates(basePath: string): string[] {
  const candidates = new Set<string>([basePath]);

  for (const child of PREFERRED_CHILD_DIRECTORIES) {
    const candidate = path.join(basePath, child);
    if (safeStat(candidate)?.isDirectory()) candidates.add(candidate);
  }

  walkForRootCandidates(basePath, candidates, 0, 3);
  return [...candidates];
}

function walkForRootCandidates(
  currentPath: string,
  candidates: Set<string>,
  depth: number,
  maxDepth: number
): void {
  if (depth > maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((entry) => entry.isFile() && ROOT_MARKERS.includes(entry.name as never))) {
    candidates.add(currentPath);
  }

  if (depth === maxDepth) return;

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue;
    walkForRootCandidates(path.join(currentPath, entry.name), candidates, depth + 1, maxDepth);
  }
}

function scoreRootCandidate(candidate: string, originalBasePath: string): number {
  let score = candidate === originalBasePath ? 1 : 0;

  for (const marker of ROOT_MARKERS) {
    if (fs.existsSync(path.join(candidate, marker))) score += marker === "package.json" ? 12 : 10;
  }

  for (const directory of ["src", "pages", "app", "public", "android", "ios", "src-tauri"]) {
    if (safeStat(path.join(candidate, directory))?.isDirectory()) score += 3;
  }

  const name = path.basename(candidate).toLowerCase();
  if (["frontend", "client", "web", "app"].includes(name)) score += 4;

  return score;
}

function scanProject(projectPath: string): {
  files: ReadonlySet<string>;
  directories: ReadonlySet<string>;
} {
  const files = new Set<string>();
  const directories = new Set<string>();

  const walk = (currentPath: string, depth: number): void => {
    if (depth > 6) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = toPosix(path.relative(projectPath, absolutePath));

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        directories.add(relativePath);
        walk(absolutePath, depth + 1);
      } else if (entry.isFile()) {
        files.add(relativePath);
      }
    }
  };

  walk(projectPath, 0);

  return { files, directories };
}

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function readYamlLike(filePath: string): Record<string, unknown> | undefined {
  try {
    const source = fs.readFileSync(filePath, "utf8");
    const result: Record<string, unknown> = {};

    for (const line of source.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
      if (match) result[match[1]] = match[2];
    }

    return result;
  } catch {
    return undefined;
  }
}

function safeStat(filePath: string): fs.Stats | undefined {
  try {
    return fs.statSync(filePath);
  } catch {
    return undefined;
  }
}

function toPosix(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

function cleanVersion(version: string): string {
  return version.replace(/^[~^<>=\s]+/, "").trim();
}
