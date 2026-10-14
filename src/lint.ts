import { runCommand } from "./utils.js";
import fs from "fs";
import path from "path";
import fg from "fast-glob";
import { SOURCE_GLOB_IGNORE } from "./utils/sourcePolicy.js";

export async function eslintArguments(projectPath: string): Promise<string[]> {
  let script = "";
  let discoveredOptions: string[] = [];
  try { script = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8")).scripts?.lint || ""; } catch {}
  // Only reuse direct, literal ESLint arguments, never execute shell expressions
  // or mutation flags from a project's script during an audit.
  if (/^eslint\s/.test(script) && !/[;&|<>`$]/.test(script)) {
    const tokens = script.match(/"[^"]*"|'[^']*'|[^\s]+/g)!.slice(1).map(token => token.replace(/^(["'])(.*)\1$/, "$2"));
    const args: string[] = [];
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!;
      if (["--fix", "--fix-dry-run"].includes(token)) continue;
      if (["--format", "-f", "--output-file", "-o"].includes(token)) { index++; continue; }
      if (/^--(?:format|output-file)=/.test(token)) continue;
      args.push(token);
    }
    if (args.length && !args.includes(".")) return args;
    discoveredOptions = args;
  }
  // ESLint 8 does not include TypeScript when traversing '.' without --ext.
  // Explicit source filenames work with both legacy and flat configurations.
  const files = (await fg(["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"], { cwd: projectPath, ignore: [...SOURCE_GLOB_IGNORE, "**/*.d.ts"], onlyFiles: true }))
    .filter(file => !ESLINT_CONFIGS.includes(file)).sort();
  if (discoveredOptions.includes(".")) return discoveredOptions.flatMap(arg => arg === "." ? files.length ? files : ["."] : [arg]);
  return files.length ? files : ["."];
}

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
  "eslint.config.ts",
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
  let hasConfig = ESLINT_CONFIGS.some((file) => fs.existsSync(path.join(projectPath, file)));
  try { hasConfig ||= Boolean(JSON.parse(fs.readFileSync(path.join(projectPath,"package.json"),"utf8")).eslintConfig); } catch {}
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
      "--no-install",
      "eslint",
      ...await eslintArguments(projectPath),
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

  // Never invoke framework setup commands as a fallback: they can prompt and mutate config.

  const issues: EslintIssue[] = [];
  let errorCount = 0;
  let warningCount = 0;
  const toolingWarnings: string[] = [];
  let verifiedOutput = false;

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
      if (!Array.isArray(parsed) || parsed.some(item => typeof item.filePath !== "string" || !Array.isArray(item.messages))) throw new Error("Invalid ESLint result shape");
      verifiedOutput = true;

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

  if (!verifiedOutput) toolingWarnings.push("ESLint did not produce a verified JSON result");
  const success = cmdResult.exitCode === 0 && verifiedOutput && issues.length === 0;

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
