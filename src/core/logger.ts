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
      result.status === "PASS"
        ? "✔"
        : result.status === "FAIL" || result.status === "ERROR"
          ? "✖"
          : result.status === "SKIPPED" || result.status === "NOT_APPLICABLE"
            ? "○"
            : "⚠";

    const scoreDisplay = typeof result.score === "number" ? ` (${result.score})` : "";
    const text = `${icon} ${result.name}: ${result.status}${scoreDisplay}`;

    const color =
      result.status === "PASS"
        ? chalk.green
        : result.status === "FAIL" || result.status === "ERROR"
          ? chalk.red
          : result.status === "SKIPPED" || result.status === "NOT_APPLICABLE"
            ? chalk.gray
            : chalk.yellow;

    console.log(color(text));
    if (result.message) console.log(chalk.gray(`  ${result.message}`));
    if (result.skipReason) console.log(chalk.gray(`  Reason: ${result.skipReason}`));
    if (result.errorReason) console.log(chalk.red(`  Error: ${result.errorReason}`));

    for (const suggestion of getShortIssueSuggestions(result)) {
      console.log(chalk.gray(`  Fix: ${suggestion}`));
    }
  },
  footer(score: number, reportPath: string, baseline?: AuditReport["baseline"], report?: AuditReport): void {
    const scoreColor =
      score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;

    console.log();
    console.log(chalk.cyan(line));
    console.log(chalk.bold.white("                QA SUMMARY"));
    console.log(chalk.cyan(line));

    console.log(
      `${chalk.gray("Overall Score")} : ${scoreColor.bold(`${score}/100`)}`,
    );

    if (report?.coverage) {
      console.log(
        `${chalk.gray("Scan Coverage")} : ${chalk.bold.white(`${report.coverage.coveragePercent}%`)} (${report.coverage.executedSuccessfully}/${report.coverage.applicableScanners} applicable scanners executed)`,
      );
    }

    console.log(`${chalk.gray("Report")}        : ${chalk.cyan(reportPath)}`);

    if (baseline) {
      console.log();
      console.log(chalk.bold.white("Previous Scan → Current Scan"));
      if (baseline.categoryScores && baseline.categoryScores.length > 0) {
        for (const cat of baseline.categoryScores) {
          const icon = cat.status === "REGRESSED" ? "🔴" : "🟢";
          const nameStr = cat.category.padEnd(16, " ");
          const scoreStr = `${cat.previousScore} → ${cat.currentScore}`.padEnd(10, " ");
          console.log(`  ${nameStr} ${scoreStr} ${icon}`);
        }
      } else {
        const scoreDelta =
          baseline.overallScore.delta > 0
            ? chalk.green(`+${baseline.overallScore.delta}`)
            : baseline.overallScore.delta < 0
              ? chalk.red(String(baseline.overallScore.delta))
              : chalk.gray("0");
        console.log(
          `${chalk.gray("  Score")}        : ${baseline.overallScore.previous}/100 -> ${baseline.overallScore.current}/100 (${scoreDelta})`,
        );
      }

      const { newIssues, fixedIssues } = baseline.categorizedIssues || {};
      if (newIssues && newIssues.length > 0) {
        console.log(chalk.bold.red("\nNEW ISSUES"));
        for (const issue of newIssues.slice(0, 5)) {
          console.log(chalk.red(`  ❌ [${issue.checkName}] ${issue.message}`));
        }
        if (newIssues.length > 5) {
          console.log(chalk.gray(`     ... +${newIssues.length - 5} more new issue(s)`));
        }
      }

      if (fixedIssues && fixedIssues.length > 0) {
        console.log(chalk.bold.green("\nFIXED ISSUES"));
        for (const issue of fixedIssues.slice(0, 5)) {
          console.log(chalk.green(`  ✅ [${issue.checkName}] ${issue.message}`));
        }
        if (fixedIssues.length > 5) {
          console.log(chalk.gray(`     ... +${fixedIssues.length - 5} fixed issue(s)`));
        }
      }
    }

    console.log();
    // 1. Current Quality Gate
    if (report?.currentQualityGate) {
      const currentGateText = report.currentQualityGate.passed
        ? chalk.bold.green("Current Quality Gate : PASSED ✅")
        : chalk.bold.red("Current Quality Gate : FAILED ❌");
      console.log(`  ${currentGateText}`);
      if (!report.currentQualityGate.passed && report.currentQualityGate.reasons.length > 0) {
        for (const reason of report.currentQualityGate.reasons) {
          console.log(chalk.gray(`    • ${reason}`));
        }
      }
    } else {
      const currentPassed = report ? !report.results.some((r) => r.status === "FAIL" || r.status === "ERROR") : score >= 70;
      const currentGateText = currentPassed
        ? chalk.bold.green("Current Quality Gate : PASSED ✅")
        : chalk.bold.red("Current Quality Gate : FAILED ❌");
      console.log(`  ${currentGateText}`);
    }

    // 2. Regression Gate
    if (baseline?.qualityGate) {
      const regGateText = baseline.qualityGate.passed
        ? chalk.bold.green("Regression Gate      : PASSED ✅")
        : chalk.bold.red("Regression Gate      : FAILED ❌");
      console.log(`  ${regGateText}`);
    }

    console.log(chalk.cyan(line));
  },
};
