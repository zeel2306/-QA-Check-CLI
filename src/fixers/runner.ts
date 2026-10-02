import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fixDebugStatements } from "./debugFixer.js";
import { fixHtmlAccessibilityAndMeta } from "./htmlFixer.js";
import type { FixDetail, FixerOptions, FixerSummary } from "./types.js";

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

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".svelte",
  ".html",
  ".htm",
  ".php",
  ".dart",
  ".blade.php",
]);

const MAX_FILES = 500;
const MAX_FILE_BYTES = 500_000;

function collectFiles(dirPath: string): string[] {
  const files: string[] = [];

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

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        try {
          if (fs.statSync(fullPath).size > MAX_FILE_BYTES) continue;
        } catch {
          continue;
        }

        files.push(fullPath);
      }
    }
  };

  walk(dirPath);
  return files;
}

export async function runAutoFix(projectPath: string, options: FixerOptions = {}): Promise<FixerSummary> {
  const isDryRun = Boolean(options.dryRun);
  const files = collectFiles(projectPath);

  let filesModified = 0;
  let totalFixes = 0;
  const allDetails: FixDetail[] = [];

  console.log(chalk.cyan("\n🛠️  QA Check Auto-Fix Engine"));
  console.log(chalk.gray(`Scanning ${files.length} source file(s) in: ${projectPath}\n`));

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const relativePath = path.relative(projectPath, filePath).replaceAll(path.sep, "/");

    // Pass 1: Debug statement fixes
    const debugResult = fixDebugStatements(content, relativePath);

    // Pass 2: HTML accessibility / meta fixes
    const htmlResult = fixHtmlAccessibilityAndMeta(debugResult.newContent, relativePath);

    const fileFixes = [...debugResult.fixes, ...htmlResult.fixes];

    if (fileFixes.length > 0) {
      filesModified += 1;
      totalFixes += fileFixes.length;
      allDetails.push(...fileFixes);

      if (!isDryRun) {
        fs.writeFileSync(filePath, htmlResult.newContent, "utf8");
      }

      console.log(`${chalk.green("✔ Fixed")} ${chalk.bold(relativePath)} (${fileFixes.length} issue(s))`);
      for (const fix of fileFixes) {
        console.log(`   ${chalk.gray("└─")} ${chalk.yellow(fix.rule)}: ${fix.description}`);
      }
    }
  }

  console.log("\n" + chalk.bold("Summary:"));
  if (totalFixes === 0) {
    console.log(chalk.green("✨ No fixable code issues found! Codebase is clean."));
  } else {
    const statusText = isDryRun ? chalk.yellow("[DRY RUN - No files changed]") : chalk.green("[FILES UPDATED]");
    console.log(`  ${statusText} Fixed ${chalk.bold(totalFixes)} issue(s) across ${chalk.bold(filesModified)} file(s).`);
  }
  console.log("");

  return {
    filesScanned: files.length,
    filesModified,
    totalFixes,
    details: allDetails,
    dryRun: isDryRun,
  };
}
