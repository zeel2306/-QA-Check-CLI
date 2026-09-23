import fs from "fs";
import path from "path";
import type { QaEngineOptions } from "./core/engine.js";
import { loadConfig } from "./core/config.js";
import { printCommandGuide, printHelp } from "./core/help.js";
import { initializeProject } from "./core/init.js";
import { getProfileOptions, isQaProfile } from "./core/profile.js";

function appendOption(values: string[] | undefined, value: string | undefined): string[] {
  return [...(values ?? []), ...(value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [])];
}

async function main() {
  const args = process.argv.slice(2);

  let projectPath = process.cwd();

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    printHelp();
    process.exit(0);
  }

  if (args[0] === "init") {
    const targetPath = args[1] && !args[1].startsWith("--") ? args[1] : process.cwd();
    const resolvedProjectPath = fs.realpathSync.native(path.resolve(targetPath));
    const result = await initializeProject(resolvedProjectPath);

    console.log("QA Check project initialized.");

    for (const file of result.created) {
      console.log(`Created: ${file}`);
    }

    for (const file of result.skipped) {
      console.log(`Skipped existing file: ${file}`);
    }

    return;
  }

const options: QaEngineOptions = {};
const explicitOptions: QaEngineOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--ci":
        explicitOptions.ci = true;
        break;

      case "--profile": {
        const value = args[++i];

        if (isQaProfile(value)) {
          options.profile = value;
        } else {
          console.error("Invalid value for --profile. Use 'report', 'ci', or 'strict'.");
          process.exit(1);
        }

        break;
      }

      case "--html":
        explicitOptions.html = true;
        break;

      case "--no-html":
        explicitOptions.html = false;
        break;

      case "--json":
        explicitOptions.json = true;
        break;

      case "--no-json":
        explicitOptions.json = false;
        break;

      case "--markdown":
      case "--md":
        explicitOptions.markdown = true;
        break;

      case "--no-markdown":
      case "--no-md":
        explicitOptions.markdown = false;
        break;

      case "--pdf":
        explicitOptions.pdf = true;
        break;

      case "--no-pdf":
        explicitOptions.pdf = false;
        break;

      case "--output":
        explicitOptions.output = args[++i] || "reports";
        break;

      case "--baseline":
        explicitOptions.baseline = args[++i];
        break;

      case "--no-baseline":
        explicitOptions.baselineComparison = false;
        break;

      case "--history":
        explicitOptions.history = true;
        break;

      case "--no-history":
        explicitOptions.history = false;
        break;

      case "--history-limit": {
        const value = Number(args[++i]);

        if (Number.isInteger(value) && value > 0) {
          explicitOptions.historyLimit = value;
        } else {
          console.error("Invalid value for --history-limit. Use a positive whole number.");
          process.exit(1);
        }

        break;
      }

      case "--route":
      case "--include-route":
        explicitOptions.includeRoutes = appendOption(explicitOptions.includeRoutes, args[++i]);
        break;

      case "--ignore-route":
        explicitOptions.ignoreRoutes = appendOption(explicitOptions.ignoreRoutes, args[++i]);
        break;

      case "--max-routes": {
        const value = Number(args[++i]);

        if (Number.isInteger(value) && value > 0) {
          explicitOptions.maxRoutes = value;
        } else {
          console.error("Invalid value for --max-routes. Use a positive whole number.");
          process.exit(1);
        }

        break;
      }

      case "--min-score": {
        const value = Number(args[++i]);

        if (Number.isFinite(value) && value >= 0 && value <= 100) {
          explicitOptions.minScore = value;
        } else {
          console.error("Invalid value for --min-score. Use a number from 0 to 100.");
          process.exit(1);
        }

        break;
      }

      case "--fail-on": {
        const value = args[++i];

        if (value === "warning" || value === "error" || value === "none") {
          explicitOptions.failOn = value;
        } else {
          console.error(
            "Invalid value for --fail-on. Use 'warning', 'error', or 'none'.",
          );
          process.exit(1);
        }

        break;
      }

      default:
        if (!arg.startsWith("--")) {
          projectPath = arg;
        }
    }
  }

  const resolvedProjectPath = fs.realpathSync.native(
    path.resolve(projectPath),
  );
const config = loadConfig(resolvedProjectPath);
const configProfileOptions = getProfileOptions(config.profile);
const cliProfileOptions = getProfileOptions(options.profile);
const finalOptions: QaEngineOptions = {
  ci: false,
  html: true,
  json: true,
  markdown: true,
  pdf: true,
  output: "reports",
  failOn: "error",
  minScore: 0,
  history: true,
  historyLimit: 30,

  ...configProfileOptions,
  ...config,
  ...cliProfileOptions,
  ...options,
  ...explicitOptions,
};
const [{ runQaEngine }, { getExitCode }] = await Promise.all([
  import("./core/engine.js"),
  import("./core/exitCode.js"),
]);

  const report = await runQaEngine(
  resolvedProjectPath,
  finalOptions,
);

const exitCode = getExitCode(
  report,
  finalOptions.failOn,
  finalOptions.minScore,
);

if (finalOptions.ci) {
  console.log("CI Mode:", finalOptions.ci);
  console.log("Exit Code:", exitCode);
  process.exitCode = exitCode;
} else {
  printCommandGuide(resolvedProjectPath);
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
