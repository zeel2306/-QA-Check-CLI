import { runCommand } from "./utils.js";
import { hasScript } from "./scripts.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import fsp from "node:fs/promises";
import fg from "./utils/sourceGlob.js";

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

async function runBuildInPlace(projectPath: string) {
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

/** Next build/dev share distDir (normally .next). Build an owned source snapshot,
 * including config copies, so neither cache nor compiler-written source config is shared. */
export async function createNextBuildSnapshot(projectPath: string): Promise<{ directory: string; cleanup: () => Promise<void> }> {
  // Keep dependencies and copied source on the same volume. Next/Webpack on
  // Windows cannot resolve entries formed from relative paths across drives.
  const directory = await fsp.mkdtemp(path.join(path.dirname(projectPath), ".qa-check-next-build-"));
  const cleanup = () => fsp.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  try {
    const files = await fg("**/*", { cwd: projectPath, dot: true, onlyFiles: true, followSymbolicLinks: false,
      ignore: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/*.tsbuildinfo", "**/.qa-check*/**"] });
    for (const file of files) {
      const destination = path.join(directory, file);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(path.join(projectPath, file), destination);
    }
    let dependencyRoot = projectPath;
    while (!fs.existsSync(path.join(dependencyRoot,"node_modules"))) {
      const parent = path.dirname(dependencyRoot);
      if (parent === dependencyRoot) throw new Error("Next build isolation requires existing installed dependencies");
      dependencyRoot = parent;
    }
    await fsp.symlink(await fsp.realpath(path.join(dependencyRoot,"node_modules")), path.join(directory,"node_modules"), process.platform === "win32" ? "junction" : "dir");
    return { directory, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

export async function runBuild(projectPath: string) {
  let next = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath,"package.json"),"utf8"));
    next = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next || /\bnext\s+build\b/.test(pkg.scripts?.build || ""));
  } catch {}
  if (!next || !hasScript(projectPath,"build")) return runBuildInPlace(projectPath);
  let snapshot: Awaited<ReturnType<typeof createNextBuildSnapshot>> | undefined;
  try {
    snapshot = await createNextBuildSnapshot(projectPath);
    console.log("[Build] Next.js build isolated in a temporary source snapshot; live output/config preserved");
    const result = await runBuildInPlace(snapshot.directory);
    return { ...result, isolation: "TEMPORARY_SOURCE_SNAPSHOT", originalProjectMutations: [] };
  } catch (error) {
    return { success: false, exitCode: 1, stdout: "", stderr: `Isolated Next build failed: ${error instanceof Error ? error.message : error}`, projectMutations: [], isolation: "TEMPORARY_SOURCE_SNAPSHOT" };
  } finally { await snapshot?.cleanup(); }
}
