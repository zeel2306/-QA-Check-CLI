import fs from "fs";
import path from "path";
import { runQaEngine } from "./core/engine.js";
import { getExitCode } from "./core/exitCode.js";
import type { QaEngineOptions } from "./core/engine.js";
import { loadConfig } from "./core/config.js";

async function main() {
  const args = process.argv.slice(2);

  let projectPath = process.cwd();

const options: QaEngineOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--ci":
        options.ci = true;
        break;

      case "--html":
        options.html = true;
        break;

      case "--no-html":
        options.html = false;
        break;

      case "--json":
        options.json = true;
        break;

      case "--no-json":
        options.json = false;
        break;

      case "--pdf":
        options.pdf = true;
        break;

      case "--no-pdf":
        options.pdf = false;
        break;

      case "--output":
        options.output = args[++i] || "reports";
        break;

      case "--baseline":
        options.baseline = args[++i];
        break;

      case "--no-baseline":
        options.baselineComparison = false;
        break;

    case "--fail-on": {
  const value = args[++i];

  if (value === "warning" || value === "error") {
    options.failOn = value;
  } else {
    console.error(
      "Invalid value for --fail-on. Use 'warning' or 'error'.",
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
const finalOptions: QaEngineOptions = {
  ci: false,
  html: true,
  json: true,
  pdf: true,
  output: "reports",
  failOn: "error",

  ...config,
  ...options,
};
  const report = await runQaEngine(
  resolvedProjectPath,
  finalOptions,
);
console.log("CI Mode:", finalOptions.ci);

const exitCode = getExitCode(
  report,
  finalOptions.failOn,
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
