import type { Check, CheckResult } from "../types/result.js";

interface LegacyResult { success: boolean; stdout: string; stderr: string; exitCode: number | undefined }

export class CommandCheck implements Check<LegacyResult> {
  constructor(readonly name: string, private readonly command: (projectPath: string) => Promise<LegacyResult>) {}
  async run(projectPath: string): Promise<CheckResult<LegacyResult>> {
    const started = performance.now();
    const data = await this.command(projectPath);
    const unavailable = data.exitCode === -1;
    return { name: this.name, status: unavailable ? "SKIPPED" : data.success ? "PASS" : "FAIL", message: data.success ? "Passed" : data.stderr || data.stdout, duration: performance.now() - started, data };
  }
}
