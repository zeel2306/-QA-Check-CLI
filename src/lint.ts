import { runCommand } from "./utils.js";
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

export interface EslintIssue {
  file: string;
  line: number;
  column: number;
  severity: 1 | 2; // 1 = warning, 2 = error
  ruleId: string;
  message: string;
  type: string;
}

export interface EslintResultData {
  success: boolean;
  exitCode: number | undefined;
  errorCount: number;
  warningCount: number;
  totalIssues: number;
  issues: EslintIssue[];
  toolingWarnings: string[];
  stdout: string;
  stderr: string;
}

export async function runLint(projectPath: string): Promise<EslintResultData> {
  const hasConfig = ESLINT_CONFIGS.some((file) => fs.existsSync(path.join(projectPath, file)));

  if (!hasConfig) {
    return {
      success: false,
      exitCode: -1,
      errorCount: 0,
      warningCount: 0,
      totalIssues: 0,
      issues: [],
      toolingWarnings: [],
      stdout: "",
      stderr: "No ESLint configuration found",
    };
  }

  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

  // Attempt JSON formatted execution with standard ignore patterns
  const cmdResult = await runCommand(
    npxCommand,
    [
      "eslint",
      ".",
      "--format",
      "json",
      "--ignore-pattern",
      ".next/**",
      "--ignore-pattern",
      "reports/**",
      "--ignore-pattern",
      "dist/**",
      "--ignore-pattern",
      "coverage/**",
      "--ignore-pattern",
      "build/**",
    ],
    projectPath,
  );

  const issues: EslintIssue[] = [];
  let errorCount = 0;
  let warningCount = 0;
  const toolingWarnings: string[] = [];

  if (cmdResult.stderr && cmdResult.stderr.trim()) {
    toolingWarnings.push(cmdResult.stderr.trim());
  }

  // Attempt parsing JSON output
  try {
    const rawOut = cmdResult.stdout.trim();
    const jsonStart = rawOut.indexOf("[");
    const jsonEnd = rawOut.lastIndexOf("]");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = rawOut.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr) as Array<{
        filePath: string;
        messages: Array<{
          ruleId?: string;
          severity: number;
          message: string;
          line: number;
          column: number;
        }>;
      }>;

      for (const fileResult of parsed) {
        const relFile = path.relative(projectPath, fileResult.filePath).replaceAll(path.sep, "/");
        for (const msg of fileResult.messages || []) {
          const ruleId = msg.ruleId || "generic";
          const severity = msg.severity === 2 ? 2 : 1;
          issues.push({
            file: relFile,
            line: msg.line || 1,
            column: msg.column || 1,
            severity,
            ruleId,
            message: msg.message,
            type: `eslint:${ruleId}`,
          });

          if (severity === 2) errorCount++;
          else warningCount++;
        }
      }
    }
  } catch {
    // Fallback if JSON parsing fails
  }

  const success = cmdResult.exitCode === 0 && issues.length === 0;

  return {
    success,
    exitCode: cmdResult.exitCode,
    errorCount,
    warningCount,
    totalIssues: issues.length,
    issues,
    toolingWarnings,
    stdout: cmdResult.stdout,
    stderr: cmdResult.stderr,
  };
}
