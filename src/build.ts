import { runCommand } from "./utils.js";
import { hasScript } from "./scripts.js";

export async function runBuild(projectPath: string) {
  if (!hasScript(projectPath, "build")) {
    return {
      success: false,
      stdout: "",
      stderr: "No build script found",
      exitCode: -1,
    };
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  return await runCommand(
    npmCommand,
    ["run", "build"],
    projectPath
  );
}