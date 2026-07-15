import chalk from "chalk";
import type { AuditReport, CheckResult } from "../types/result.js";
import { getShortIssueSuggestions } from "../suggestions/index.js";

const line = "========================================";

export const logger = {
  header(): void {
    console.log(chalk.cyan(`${line}\n\nQA CHECK v2\n\n${line}\n`));
  },
  section(title: string): void {
    console.log(chalk.cyan(`\n${title}`));
  },
  start(current: number, total: number, checkName: string): void {
  console.log(
    chalk.blue(
      `\n[${current}/${total}] ▶ Running ${chalk.bold(checkName)}...`,
    ),
  );
},
  result(result: CheckResult): void {
    const icon =
      result.status === "PASS" ? "✔" : result.status === "FAIL" ? "✖" : "⚠";
    const text = `${icon} ${result.name}: ${result.status}${result.score === undefined ? "" : ` (${result.score})`}`;
    const color =
      result.status === "PASS"
        ? chalk.green
        : result.status === "FAIL"
          ? chalk.red
          : chalk.yellow;
    console.log(color(text));
    if (result.message) console.log(chalk.gray(`  ${result.message}`));
    for (const suggestion of getShortIssueSuggestions(result)) {
      console.log(chalk.gray(`  Fix: ${suggestion}`));
    }
  },
  footer(score: number, reportPath: string, baseline?: AuditReport["baseline"]): void {
    const scoreColor =
      score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;

    console.log();
    console.log(chalk.cyan(line));
    console.log(chalk.bold.white("                QA SUMMARY"));
    console.log(chalk.cyan(line));

    console.log(
      `${chalk.gray("Overall Score")} : ${scoreColor.bold(`${score}/100`)}`,
    );

    console.log(`${chalk.gray("Report")}        : ${chalk.cyan(reportPath)}`);

    if (baseline) {
      const scoreDelta =
        baseline.overallScore.delta > 0
          ? chalk.green(`+${baseline.overallScore.delta}`)
          : baseline.overallScore.delta < 0
            ? chalk.red(String(baseline.overallScore.delta))
            : chalk.gray("0");
      const issueDelta =
        baseline.totalIssues.delta < 0
          ? chalk.green(String(baseline.totalIssues.delta))
          : baseline.totalIssues.delta > 0
            ? chalk.red(`+${baseline.totalIssues.delta}`)
            : chalk.gray("0");

      console.log(
        `${chalk.gray("Baseline")}      : ${baseline.overallScore.previous}/100 -> ${baseline.overallScore.current}/100 (${scoreDelta})`,
      );
      console.log(
        `${chalk.gray("Issues")}        : ${baseline.totalIssues.previous} -> ${baseline.totalIssues.current} (${issueDelta})`,
      );
    }

    console.log(chalk.cyan(line));
  },
};
