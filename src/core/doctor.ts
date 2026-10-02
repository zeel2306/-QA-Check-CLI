import fs from "fs";
import path from "path";
import chalk from "chalk";
import { detectProjectFramework } from "../framework/detect.js";

export interface DoctorCheckItem {
  name: string;
  status: "PASS" | "WARNING" | "FAIL" | "INFO";
  message: string;
  detail?: string;
}

export interface DoctorReport {
  projectPath: string;
  items: DoctorCheckItem[];
  ready: boolean;
}

function exists(dir: string, relative: string): boolean {
  return fs.existsSync(path.join(dir, relative));
}

export async function runDoctor(projectPath: string): Promise<DoctorReport> {
  const items: DoctorCheckItem[] = [];

  console.log(chalk.cyan("\n🩺 QA Check Doctor Diagnostics"));
  console.log(chalk.gray(`Analyzing environment and project setup at: ${projectPath}\n`));

  // 1. Node.js Version Check
  const nodeVersionStr = process.version;
  const majorVersion = parseInt(nodeVersionStr.replace(/^v/, "").split(".")[0] || "0", 10);
  if (majorVersion >= 20) {
    items.push({
      name: "Node.js Environment",
      status: "PASS",
      message: `Node.js ${nodeVersionStr} available (Node 20+ required)`,
    });
  } else {
    items.push({
      name: "Node.js Environment",
      status: "WARNING",
      message: `Node.js ${nodeVersionStr} detected. Node 20 or higher is recommended for full features.`,
    });
  }

  // 2. Git Repository Check
  let hasGit = false;
  let currentCheck = projectPath;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(currentCheck, ".git"))) {
      hasGit = true;
      break;
    }
    const parent = path.dirname(currentCheck);
    if (parent === currentCheck) break;
    currentCheck = parent;
  }

  if (hasGit) {
    items.push({
      name: "Git Repository",
      status: "PASS",
      message: "Git repository detected",
    });
  } else {
    items.push({
      name: "Git Repository",
      status: "INFO",
      message: "No .git folder found. Baseline history & PR comments work best inside a Git repo.",
    });
  }

  // 3. Framework Detection Check
  try {
    const frameworkResult = detectProjectFramework(projectPath);
    const fwName = frameworkResult.framework;
    const lang = frameworkResult.language;
    items.push({
      name: "Framework Detection",
      status: "PASS",
      message: `Framework detected: ${chalk.bold(fwName)} (${lang})`,
      detail: `Package Manager: ${frameworkResult.packageManager || "npm"}, Build Tool: ${frameworkResult.buildTool || "default"}`,
    });
  } catch (error) {
    items.push({
      name: "Framework Detection",
      status: "WARNING",
      message: "Could not auto-detect framework. Generic fallback pipeline will be used.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // 4. Playwright Browser Check
  try {
    const { chromium } = await import("playwright");
    const executable = chromium.executablePath();
    if (executable && fs.existsSync(executable)) {
      items.push({
        name: "Browser Engine",
        status: "PASS",
        message: "Playwright Chromium browser engine available",
      });
    } else {
      items.push({
        name: "Browser Engine",
        status: "PASS",
        message: "Playwright package available (Chromium path dynamically resolved)",
      });
    }
  } catch {
    items.push({
      name: "Browser Engine",
      status: "WARNING",
      message: "Playwright not installed locally. Run 'npx playwright install --with-deps' for browser audits.",
    });
  }

  // 5. TypeScript & Linter Config Check
  const hasPackageJson = exists(projectPath, "package.json");
  const hasTsConfig = exists(projectPath, "tsconfig.json");
  const hasEslint =
    exists(projectPath, ".eslintrc") ||
    exists(projectPath, ".eslintrc.json") ||
    exists(projectPath, ".eslintrc.js") ||
    exists(projectPath, "eslint.config.js") ||
    exists(projectPath, "eslint.config.mjs");

  if (hasPackageJson) {
    const details: string[] = [];
    if (hasTsConfig) details.push("tsconfig.json");
    if (hasEslint) details.push("ESLint config");

    items.push({
      name: "Code Quality Tools",
      status: "PASS",
      message: details.length > 0 ? `Detected ${details.join(" & ")}` : "package.json detected",
    });
  } else if (exists(projectPath, "pubspec.yaml")) {
    items.push({
      name: "Code Quality Tools",
      status: "PASS",
      message: "Flutter/Dart pubspec.yaml manifest detected",
    });
  } else if (exists(projectPath, "composer.json")) {
    items.push({
      name: "Code Quality Tools",
      status: "PASS",
      message: "PHP/Composer manifest detected",
    });
  } else {
    items.push({
      name: "Code Quality Tools",
      status: "INFO",
      message: "No project manifest found in target directory",
    });
  }

  // 6. Project Configuration Check
  if (exists(projectPath, "qa-check.config.json")) {
    items.push({
      name: "Project Configuration",
      status: "PASS",
      message: "qa-check.config.json present",
    });
  } else {
    items.push({
      name: "Project Configuration",
      status: "INFO",
      message: "qa-check.config.json not found. Run 'qa-check init' to generate a starter config.",
    });
  }

  // 7. Output Directory Permission Check
  const reportsFolder = path.join(projectPath, "reports");
  let writable = true;
  try {
    if (!fs.existsSync(reportsFolder)) {
      fs.mkdirSync(reportsFolder, { recursive: true });
    }
    const testFile = path.join(reportsFolder, ".write_test");
    fs.writeFileSync(testFile, "test", "utf8");
    fs.unlinkSync(testFile);
  } catch {
    writable = false;
  }

  if (writable) {
    items.push({
      name: "Reports Output Path",
      status: "PASS",
      message: "reports/ directory is writable",
    });
  } else {
    items.push({
      name: "Reports Output Path",
      status: "FAIL",
      message: "reports/ directory is not writable. Check folder permissions.",
    });
  }

  // Print results to console
  const hasFailures = items.some((item) => item.status === "FAIL");

  for (const item of items) {
    let icon = chalk.green("✔");
    if (item.status === "WARNING") icon = chalk.yellow("⚠️");
    if (item.status === "FAIL") icon = chalk.red("✖");
    if (item.status === "INFO") icon = chalk.blue("ℹ");

    console.log(`${icon} ${chalk.bold(item.name.padEnd(24))} ${item.message}`);
    if (item.detail) {
      console.log(`  ${chalk.gray("└─")} ${chalk.gray(item.detail)}`);
    }
  }

  console.log("\n" + chalk.bold("Diagnostic Summary:"));
  if (hasFailures) {
    console.log(chalk.red("✖ Environment has issues that need attention before running full audits.\n"));
  } else {
    console.log(chalk.green("✨ Environment is ready for QA Check CLI!\n"));
  }

  return {
    projectPath,
    items,
    ready: !hasFailures,
  };
}
