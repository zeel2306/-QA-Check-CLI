import { runCommand } from "./utils.js";
import fs from "fs";
import path from "path";
export async function runTypeScript(projectPath) {
    if (!fs.existsSync(path.join(projectPath, "tsconfig.json"))) {
        return {
            success: false,
            stdout: "",
            stderr: "No tsconfig.json found",
            exitCode: -1,
        };
    }
    const localCompiler = path.join(projectPath, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
    if (!fs.existsSync(localCompiler)) {
        return {
            success: false,
            stdout: "",
            stderr: "TypeScript compiler is not installed in this project",
            exitCode: -1,
        };
    }
    return await runCommand(localCompiler, ["--noEmit"], projectPath);
}
