import fs from "fs";
import path from "path";
import { runQaEngine } from "./core/engine.js";

async function main() {
  const requestedProjectPath = process.argv[2] || process.cwd();
  const projectPath = fs.realpathSync.native(path.resolve(requestedProjectPath));
  await runQaEngine(projectPath);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
