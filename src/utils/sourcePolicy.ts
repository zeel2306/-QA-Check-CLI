import path from "path";

/**
 * Centralized list of directory names representing generated artifacts, caches, dependencies,
 * or build outputs that MUST NOT be scanned as application source code.
 */
export const DEFAULT_EXCLUDED_DIRECTORIES: readonly string[] = [
  "node_modules",
  ".angular",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".vite",
  ".vuepress",
  ".git",
  ".hg",
  ".svn",
  "build",
  "dist",
  "out",
  "coverage",
  "reports",
  "tmp",
  "temp",
  "vendor",
  "android",
  "ios",
];

/**
 * Centralized glob ignore patterns for fast-glob across all static scanners.
 */
export const SOURCE_GLOB_IGNORE: readonly string[] = [
  "**/node_modules/**",
  "**/.angular/**",
  "**/.cache/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/.svelte-kit/**",
  "**/.turbo/**",
  "**/.vite/**",
  "**/build/**",
  "**/dist/**",
  "**/out/**",
  "**/coverage/**",
  "**/reports/**",
  "**/tmp/**",
  "**/temp/**",
  "**/vendor/**",
  "**/.git/**",
];

export function isExcludedDir(dirName: string): boolean {
  const norm = dirName.trim().toLowerCase();
  return DEFAULT_EXCLUDED_DIRECTORIES.includes(norm);
}

/**
 * Returns true if a file is legitimate project-owned application source code,
 * filtering out generated cache paths, node_modules, build outputs, and minified bundles.
 */
export function isProjectSourceFile(filePath: string, projectPath?: string): boolean {
  const relPath = projectPath ? path.relative(projectPath, filePath) : filePath;
  const normalized = relPath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");

  for (const seg of segments) {
    if (DEFAULT_EXCLUDED_DIRECTORIES.includes(seg)) {
      return false;
    }
  }

  const baseName = segments.at(-1) || "";
  if (baseName.endsWith(".min.js") || baseName.endsWith(".min.css") || baseName.endsWith(".bundle.js")) {
    return false;
  }

  return true;
}
