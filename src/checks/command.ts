import type { Check, CheckResult, CheckStatus } from "../types/result.js";

interface LegacyResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
  errorCount?: number;
  warningCount?: number;
  totalIssues?: number;
  issues?: any[];
  toolingWarnings?: string[];
}

export class CommandCheck implements Check<LegacyResult> {
  constructor(readonly name: string, private readonly command: (projectPath: string) => Promise<LegacyResult>) {}

  async run(projectPath: string): Promise<CheckResult<LegacyResult>> {
    const started = performance.now();
    const data = await this.command(projectPath);
    const unavailable = data.exitCode === -1;

    let status: CheckStatus = data.success ? "PASS" : "FAIL";
    let message = data.success ? "Passed" : data.stderr || data.stdout;
    let score: number | null | undefined = undefined;
    let issues: any[] | undefined = undefined;

    if (this.name === "ESLint" && !unavailable) {
      const errorCount = data.errorCount ?? 0;
      const warningCount = data.warningCount ?? 0;
      const total = data.totalIssues ?? (Array.isArray(data.issues) ? data.issues.length : 0);

      issues = data.issues;
      status = total === 0 ? "PASS" : "FAIL";
      score = total === 0 ? 100 : Math.max(0, 100 - (errorCount * 25 + warningCount * 5));
      message = total === 0 ? "Passed" : `${total} findings — ${errorCount} errors, ${warningCount} warnings`;
    } else if (unavailable) {
      if (this.name === "TypeScript" && (data.stderr?.includes("No tsconfig.json") || data.stderr?.includes("not installed"))) {
        status = "NOT_APPLICABLE";
        message = "Project does not use TypeScript";
      } else if (this.name.includes("Lint") || this.name === "ESLint") {
        status = "NOT_APPLICABLE";
        message = "No ESLint configuration found (project does not configure linting)";
      } else {
        status = "SKIPPED";
      }
    }

    return {
      name: this.name,
      status,
      score,
      message,
      duration: Math.round(performance.now() - started),
      issues,
      data,
    };
  }
}
