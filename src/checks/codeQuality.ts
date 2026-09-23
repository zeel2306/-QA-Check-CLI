import fs from "fs";
import path from "path";
import type { Check, CheckResult } from "../types/result.js";

type CodeQualityIssue = {
  type: string;
  message: string;
  file?: string;
  line?: number;
  count?: number;
  sample?: string;
};

type SourceFile = {
  absolutePath: string;
  relativePath: string;
};

type CodeQualityData = {
  filesScanned: number;
  linesScanned: number;
  components: number;
  screens: number;
  screenFlowSignals: number;
  issues: CodeQualityIssue[];
  metrics: {
    largeFiles: number;
    repeatedCode: number;
    debugStatements: number;
    todos: number;
    longBuildMethods: number;
  };
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".dart"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "android",
  "build",
  "coverage",
  "dist",
  "ios",
  "node_modules",
  "reports",
  "vendor",
]);

const MAX_FILES = 350;
const MAX_FILE_BYTES = 350_000;
const LARGE_FILE_LINES = 500;
const LONG_BUILD_METHOD_LINES = 120;
const DUPLICATE_LINE_THRESHOLD = 4;

function toRelative(projectPath: string, absolutePath: string): string {
  return path.relative(projectPath, absolutePath).replaceAll(path.sep, "/");
}

function collectSourceFiles(projectPath: string): SourceFile[] {
  const files: SourceFile[] = [];

  const walk = (currentPath: string): void => {
    if (files.length >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;

      try {
        if (fs.statSync(absolutePath).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }

      files.push({
        absolutePath,
        relativePath: toRelative(projectPath, absolutePath),
      });
    }
  };

  walk(projectPath);
  return files;
}

function isReusableLine(line: string): boolean {
  if (line.length < 24) return false;
  if (/^(import|export|\/\/|\/\*|\*|\}|\{|\)|\(|;|,)/.test(line)) return false;
  if (/^(return|break|continue);?$/.test(line)) return false;
  return true;
}

function countMatches(content: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + [...content.matchAll(pattern)].length, 0);
}

function findDebugStatements(lines: string[], file: string): CodeQualityIssue[] {
  const issues: CodeQualityIssue[] = [];

  lines.forEach((line, index) => {
    if (/\b(console\.(log|debug|warn)|debugPrint|print)\s*\(/.test(line)) {
      issues.push({
        type: "debug-statement",
        message: "Debug logging is present in source code.",
        file,
        line: index + 1,
        sample: line.trim(),
      });
    }
  });

  return issues;
}

function findTodos(lines: string[], file: string): CodeQualityIssue[] {
  const issues: CodeQualityIssue[] = [];

  lines.forEach((line, index) => {
    if (/\b(TODO|FIXME|HACK)\b/i.test(line)) {
      issues.push({
        type: "todo-marker",
        message: "A TODO/FIXME/HACK marker needs follow-up.",
        file,
        line: index + 1,
        sample: line.trim(),
      });
    }
  });

  return issues;
}

function findLongFlutterBuildMethods(lines: string[], file: string): CodeQualityIssue[] {
  const issues: CodeQualityIssue[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/\bWidget\s+build\s*\(/.test(lines[index])) continue;

    let depth = 0;
    let started = false;

    for (let cursor = index; cursor < lines.length; cursor += 1) {
      for (const char of lines[cursor]) {
        if (char === "{") {
          depth += 1;
          started = true;
        } else if (char === "}") {
          depth -= 1;
        }
      }

      if (started && depth <= 0) {
        const length = cursor - index + 1;
        if (length > LONG_BUILD_METHOD_LINES) {
          issues.push({
            type: "long-build-method",
            message: `Flutter build method is ${length} lines long. Consider extracting smaller widgets.`,
            file,
            line: index + 1,
            count: length,
          });
        }
        break;
      }
    }
  }

  return issues;
}

export class CodeQualityInsightsCheck implements Check<CodeQualityData> {
  readonly name = "Code Quality Insights";

  async run(projectPath: string): Promise<CheckResult<CodeQualityData>> {
    const started = performance.now();
    const files = collectSourceFiles(projectPath);
    const issues: CodeQualityIssue[] = [];
    const repeatedLines = new Map<string, Array<{ file: string; line: number }>>();
    let linesScanned = 0;
    let components = 0;
    let screens = 0;
    let screenFlowSignals = 0;

    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file.absolutePath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      linesScanned += lines.length;

      if (lines.length > LARGE_FILE_LINES) {
        issues.push({
          type: "large-file",
          message: `Source file has ${lines.length} lines. Consider splitting it into smaller modules or components.`,
          file: file.relativePath,
          count: lines.length,
        });
      }

      components += countMatches(content, [
        /\bclass\s+\w+\s+extends\s+(StatelessWidget|StatefulWidget)\b/g,
        /\b(function|const)\s+[A-Z]\w*\s*[=:]/g,
      ]);
      screens += countMatches(content, [/\bclass\s+\w*(Screen|Page|View)\b/g, /\b(route|path)\s*:\s*["'][^"']+["']/g]);
      screenFlowSignals += countMatches(content, [
        /\bNavigator\.(push|pushNamed|pop|replace)/g,
        /\bGoRoute\s*\(/g,
        /\broutes\s*:/g,
        /\bcreateBrowserRouter\s*\(/g,
      ]);

      issues.push(...findDebugStatements(lines, file.relativePath));
      issues.push(...findTodos(lines, file.relativePath));
      issues.push(...findLongFlutterBuildMethods(lines, file.relativePath));

      lines.forEach((line, index) => {
        const normalized = line.trim().replace(/\s+/g, " ");
        if (!isReusableLine(normalized)) return;
        const occurrences = repeatedLines.get(normalized) ?? [];
        occurrences.push({ file: file.relativePath, line: index + 1 });
        repeatedLines.set(normalized, occurrences);
      });
    }

    for (const [line, occurrences] of repeatedLines) {
      const uniqueFiles = new Set(occurrences.map((occurrence) => occurrence.file));
      if (occurrences.length < DUPLICATE_LINE_THRESHOLD || uniqueFiles.size < 2) continue;

      const first = occurrences[0];
      issues.push({
        type: "repeated-code",
        message: `Similar code appears ${occurrences.length} times across ${uniqueFiles.size} files. Consider a reusable helper or component.`,
        file: first.file,
        line: first.line,
        count: occurrences.length,
        sample: line,
      });
    }

    const issueCounts = {
      largeFiles: issues.filter((issue) => issue.type === "large-file").length,
      repeatedCode: issues.filter((issue) => issue.type === "repeated-code").length,
      debugStatements: issues.filter((issue) => issue.type === "debug-statement").length,
      todos: issues.filter((issue) => issue.type === "todo-marker").length,
      longBuildMethods: issues.filter((issue) => issue.type === "long-build-method").length,
    };

    const score = Math.max(
      0,
      100 -
        issueCounts.largeFiles * 8 -
        issueCounts.repeatedCode * 5 -
        issueCounts.debugStatements * 3 -
        issueCounts.todos -
        issueCounts.longBuildMethods * 8,
    );

    const data: CodeQualityData = {
      filesScanned: files.length,
      linesScanned,
      components,
      screens,
      screenFlowSignals,
      issues: issues.slice(0, 120),
      metrics: issueCounts,
    };

    return {
      name: this.name,
      category: "code-quality",
      status: score >= 90 ? "PASS" : score >= 70 ? "WARNING" : "FAIL",
      score,
      message: issues.length
        ? `${issues.length} code quality signal(s) found across ${files.length} file(s)`
        : `${files.length} source file(s) scanned with no maintainability warnings`,
      duration: performance.now() - started,
      data,
    };
  }
}
