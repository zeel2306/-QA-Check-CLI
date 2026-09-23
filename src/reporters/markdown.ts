import fs from "fs/promises";
import path from "path";
import type { AuditReport, CheckResult } from "../types/result.js";

function statusIcon(status: CheckResult["status"]): string {
  if (status === "PASS") return "✅";
  if (status === "WARNING") return "⚠️";
  if (status === "SKIPPED") return "⏭️";
  return "❌";
}

function countByStatus(report: AuditReport): Record<CheckResult["status"], number> {
  return report.results.reduce(
    (counts, result) => {
      counts[result.status] += 1;
      return counts;
    },
    { PASS: 0, WARNING: 0, FAIL: 0, ERROR: 0, SKIPPED: 0 },
  );
}

function escapeCell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderBaseline(report: AuditReport): string {
  if (!report.baseline) return "";

  const scoreDelta = report.baseline.overallScore.delta;
  const issueDelta = report.baseline.totalIssues.delta;

  return [
    "## Baseline",
    "",
    `- Previous score: ${report.baseline.overallScore.previous}/100`,
    `- Current score: ${report.baseline.overallScore.current}/100`,
    `- Score change: ${scoreDelta > 0 ? "+" : ""}${scoreDelta}`,
    `- Issue change: ${issueDelta > 0 ? "+" : ""}${issueDelta}`,
    "",
  ].join("\n");
}

function renderHistory(report: AuditReport): string {
  if (!report.history?.runs.length) return "";

  const latest = report.history.runs.at(-1);
  const previous = report.history.runs.at(-2);

  return [
    "## History",
    "",
    `- Tracked runs: ${report.history.runs.length}`,
    `- Latest score: ${latest?.overallScore ?? report.overallScore}/100`,
    `- Previous score: ${previous ? `${previous.overallScore}/100` : "New"}`,
    `- Score change: ${report.history.scoreDelta === undefined ? "New" : `${report.history.scoreDelta > 0 ? "+" : ""}${report.history.scoreDelta}`}`,
    `- Issue change: ${report.history.issueDelta === undefined ? "New" : `${report.history.issueDelta > 0 ? "+" : ""}${report.history.issueDelta}`}`,
    "",
  ].join("\n");
}

function renderChecks(report: AuditReport): string {
  const rows = report.results.map((result) =>
    [
      `${statusIcon(result.status)} ${escapeCell(result.status)}`,
      escapeCell(result.name),
      escapeCell(result.score === undefined ? "-" : `${result.score}/100`),
      escapeCell(result.message ?? "-"),
    ].join(" | "),
  );

  return [
    "## Check Results",
    "",
    "| Status | Check | Score | Summary |",
    "| --- | --- | ---: | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

function renderMarkdown(report: AuditReport): string {
  const counts = countByStatus(report);

  return [
    "# QA Check Report",
    "",
    `Generated: ${report.finishedAt}`,
    "",
    "## Summary",
    "",
    `- Overall score: ${report.overallScore}/100`,
    `- Framework: ${report.framework}`,
    `- Pipeline: ${report.pipeline}`,
    `- Project: ${report.projectPath}`,
    `- Routes: ${report.routes.length}`,
    `- Duration: ${Math.round(report.duration / 1000)}s`,
    "",
    "| PASS | WARNING | FAIL | ERROR | SKIPPED |",
    "| ---: | ---: | ---: | ---: | ---: |",
    `| ${counts.PASS} | ${counts.WARNING} | ${counts.FAIL} | ${counts.ERROR} | ${counts.SKIPPED} |`,
    "",
    renderBaseline(report),
    renderHistory(report),
    renderChecks(report),
  ].join("\n");
}

export async function writeMarkdownReport(report: AuditReport, reportDir: string): Promise<string> {
  const output = path.join(reportDir, "report.md");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(output, renderMarkdown(report), "utf8");
  return output;
}
