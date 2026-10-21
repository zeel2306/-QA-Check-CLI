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
  "history",
  "qa-reports",
  "artifacts",
  "tmp",
  "temp",
  "vendor",
  "android",
  "ios",
];

/**
 * Centralized glob ignore patterns across all static scanners.
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
  "**/history/**",
  "**/qa-reports/**",
  "**/artifacts/**",
  "**/tmp/**",
  "**/temp/**",
  "**/vendor/**",
  "**/.git/**",
  "**/report.html",
  "**/report.json",
  "**/report.md",
  "**/report.pdf",
  "**/report_full.json",
  "**/*.report.html",
];

export function isExcludedDir(dirName: string): boolean {
  const norm = dirName.trim().toLowerCase();
  return DEFAULT_EXCLUDED_DIRECTORIES.includes(norm);
}

/**
 * Returns true if a file is legitimate project-owned application source code,
 * filtering out generated cache paths, node_modules, build outputs, generated reports, and minified bundles.
 */
export function isProjectSourceFile(filePath: string, projectPath?: string, reportDir?: string): boolean {
  const relPath = projectPath ? path.relative(projectPath, filePath) : filePath;
  const normalized = relPath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");

  for (const seg of segments) {
    if (DEFAULT_EXCLUDED_DIRECTORIES.includes(seg)) {
      return false;
    }
  }

  if (reportDir) {
    const relReport = path.relative(reportDir, filePath).replaceAll("\\", "/");
    if (!relReport.startsWith("..") && !path.isAbsolute(relReport)) {
      return false;
    }
  }

  const baseName = segments.at(-1) || "";
  if (
    baseName === "report.html" ||
    baseName === "report.json" ||
    baseName === "report.md" ||
    baseName === "report.pdf" ||
    baseName === "report_full.json" ||
    baseName.endsWith(".report.html") ||
    baseName.endsWith(".min.js") ||
    baseName.endsWith(".min.css") ||
    baseName.endsWith(".bundle.js")
  ) {
    return false;
  }

  return true;
}
