import chalk from "chalk";
import { compareWithBaseline, readBaselineReport } from "./compare.js";

export async function runCompareCommand(file1Path: string, file2Path?: string): Promise<number> {
  const line = "==================================================";

  console.log(chalk.cyan(`\n${line}`));
  console.log(chalk.bold.white("          QA CHECK REGRESSION DETECTION"));
  console.log(chalk.cyan(`${line}\n`));

  let baselineReport = await readBaselineReport(file1Path);
  let currentReport = file2Path ? await readBaselineReport(file2Path) : undefined;

  // Swap if only 1 file passed: file1Path is current report, default baseline is reports/report.json or previous run
  if (!currentReport && baselineReport) {
    currentReport = baselineReport;
    baselineReport = undefined;
  }

  if (!currentReport) {
    console.error(chalk.red(`Error: Could not read report JSON file at '${file1Path}'.`));
    return 1;
  }

  if (!baselineReport) {
    console.log(chalk.yellow(`No baseline report found to compare with '${file1Path}'.`));
    console.log(chalk.gray(`Overall Score: ${currentReport.overallScore}/100`));
    return 0;
  }

  const comparison = compareWithBaseline(currentReport, baselineReport, file1Path);
  if (!comparison) {
    console.error(chalk.red("Failed to perform regression comparison."));
    return 1;
  }

  console.log(chalk.bold.white("Previous Scan → Current Scan\n"));

  for (const cat of comparison.categoryScores) {
    const icon = cat.status === "REGRESSED" ? "🔴" : cat.status === "IMPROVED" ? "🟢" : "🟢";
    const nameStr = cat.category.padEnd(14, " ");
    const scoreStr = `${cat.previousScore} → ${cat.currentScore}`.padEnd(10, " ");
    console.log(`${nameStr} ${scoreStr} ${icon}`);
  }

  console.log("");

  const { newIssues, fixedIssues, regressedChecks } = comparison.categorizedIssues;

  if (newIssues.length > 0) {
    console.log(chalk.bold.red("NEW ISSUES"));
    for (const issue of newIssues.slice(0, 10)) {
      const loc = issue.route || issue.file || issue.url || "";
      console.log(chalk.red(`❌ [${issue.checkName}] ${issue.message}${loc ? ` (${loc})` : ""}`));
    }
    if (newIssues.length > 10) {
      console.log(chalk.gray(`   ... and ${newIssues.length - 10} more new issue(s)`));
    }
    console.log("");
  }

  if (fixedIssues.length > 0) {
    console.log(chalk.bold.green("FIXED ISSUES"));
    for (const issue of fixedIssues.slice(0, 10)) {
      const loc = issue.route || issue.file || issue.url || "";
      console.log(chalk.green(`✅ [${issue.checkName}] ${issue.message}${loc ? ` (${loc})` : ""}`));
    }
    if (fixedIssues.length > 10) {
      console.log(chalk.gray(`   ... and ${fixedIssues.length - 10} more fixed issue(s)`));
    }
    console.log("");
  }

  if (regressedChecks.length > 0) {
    console.log(chalk.bold.yellow("REGRESSED CHECKS"));
    for (const reg of regressedChecks) {
      console.log(
        chalk.yellow(
          `⚠️  ${reg.checkName}: ${reg.previousStatus} (${reg.previousScore}) → ${reg.currentStatus} (${reg.currentScore}) [${reg.scoreDelta} pts]`,
        ),
      );
    }
    console.log("");
  }

  console.log(chalk.cyan(line));
  const gateStatus = comparison.qualityGate.passed
    ? chalk.bold.green("Quality Gate: PASSED ✅")
    : chalk.bold.red("Quality Gate: FAILED ❌");
  console.log(gateStatus);

  if (!comparison.qualityGate.passed) {
    for (const reason of comparison.qualityGate.reasons) {
      console.log(chalk.red(`  • ${reason}`));
    }
  }
  console.log(chalk.cyan(`${line}\n`));

  return comparison.qualityGate.passed ? 0 : 1;
}
