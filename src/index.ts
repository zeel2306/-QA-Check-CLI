import fs from "fs";
import path from "path";
import { runQaEngine } from "./core/engine.js";
import { getExitCode } from "./core/exitCode.js";
import type { QaEngineOptions } from "./core/engine.js";
import { loadConfig } from "./core/config.js";
import { getProfileOptions, isQaProfile } from "./core/profile.js";

async function main() {
  const args = process.argv.slice(2);

  let projectPath = process.cwd();

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
  pdf: true,
  output: "reports",
  failOn: "error",
  minScore: 0,

  ...configProfileOptions,
  ...config,
  ...cliProfileOptions,
  ...options,
  ...explicitOptions,
};
  const report = await runQaEngine(
  resolvedProjectPath,
  finalOptions,
);
console.log("CI Mode:", finalOptions.ci);

const exitCode = getExitCode(
  report,
  finalOptions.failOn,
  finalOptions.minScore,
);

console.log("Exit Code:", exitCode);

if (finalOptions.ci) {
  process.exitCode = exitCode;
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
