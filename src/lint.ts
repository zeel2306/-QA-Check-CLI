import { runCommand } from "./utils.js";
import { hasScript } from "./scripts.js";
import fs from "fs";
import path from "path";

const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yml",
  ".eslintrc.yaml",
];

export async function runLint(projectPath: string) {
  const hasConfig = ESLINT_CONFIGS.some((file) => fs.existsSync(path.join(projectPath, file)));

  if (!hasConfig) {
    return {
      success: false,
      stdout: "",
      stderr: "No ESLint configuration found",
      exitCode: -1
    };
  }

  if (!hasScript(projectPath, "lint")) {
   return {
    success: false,
    stdout: "",
    stderr: "No lint script found",
    exitCode: -1
}
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  return await runCommand(
    npmCommand,
    ["run", "lint"],
    projectPath
  );
}
