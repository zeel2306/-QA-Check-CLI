import { runCommand } from "./utils.js";
import { hasScript } from "./scripts.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ProjectMutation {
  file: string;
  causedDuring: string;
}

function hashFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

const CONFIG_FILES = ["tsconfig.json", "next-env.d.ts", "package.json", "package-lock.json"];

export async function runBuild(projectPath: string) {
  if (!hasScript(projectPath, "build")) {
    return {
      success: false,
      stdout: "",
      stderr: "No build script found",
      exitCode: -1,
      projectMutations: [],
    };
  }

  const beforeHashes = new Map<string, string | null>();
  for (const file of CONFIG_FILES) {
    const fullPath = path.join(projectPath, file);
    beforeHashes.set(file, hashFile(fullPath));
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const cmdResult = await runCommand(npmCommand, ["run", "build"], projectPath);

  const projectMutations: ProjectMutation[] = [];
  for (const file of CONFIG_FILES) {
    const fullPath = path.join(projectPath, file);
    const afterHash = hashFile(fullPath);
    const beforeHash = beforeHashes.get(file);
    if (beforeHash !== afterHash) {
      projectMutations.push({ file, causedDuring: "Build" });
    }
  }

  return {
    ...cmdResult,
    projectMutations,
  };
}