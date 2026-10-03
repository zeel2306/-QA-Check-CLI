import type { AuditReport, CheckResult, CurrentQualityGate, ScanCoverage } from "../types/result.js";
import { writeHtmlReport } from "../reporters/html.js";
import { writeJsonReport } from "../reporters/json.js";
import { writeMarkdownReport } from "../reporters/markdown.js";
import { writePdfReport } from "../reporters/pdf.js";

const WEIGHTED = new Set(["SEO", "Lighthouse", "Accessibility", "Performance"]);

function resultScore(result: CheckResult): number {
  if (typeof result.score === "number") return result.score;
  if (result.status === "PASS") return 100;
  if (result.status === "WARNING") return 60;
  return 0;
}

export function calculateScanCoverage(results: CheckResult[]): ScanCoverage {
  const notApplicable = results.filter((r) => r.status === "NOT_APPLICABLE").length;
  const applicable = results.filter((r) => r.status !== "NOT_APPLICABLE");
  const executedSuccessfully = results.filter((r) => r.status === "PASS" || r.status === "FAIL" || r.status === "WARNING");
  const skipped = results.filter((r) => r.status === "SKIPPED");
  const errors = results.filter((r) => r.status === "ERROR");

  const coveragePercent = applicable.length > 0 ? Math.round((executedSuccessfully.length / applicable.length) * 100) : 0;

  return {
    applicableScanners: applicable.length,
    executedSuccessfully: executedSuccessfully.length,
    skipped: skipped.length,
    errors: errors.length,
    notApplicable,
    coveragePercent,
  };
}

export function evaluateCurrentQualityGate(
  results: CheckResult[],
  overallScore: number,
  options: { failOn?: "warning" | "error" | "none"; minScore?: number } = {}
): CurrentQualityGate {
  const failOn = options.failOn ?? "error";
  const minScore = options.minScore ?? 0;
  const failingChecks: string[] = [];
  const warningChecks: string[] = [];
  const reasons: string[] = [];

  for (const r of results) {
    if (r.status === "FAIL" || r.status === "ERROR") {
      failingChecks.push(r.name);
      reasons.push(`${r.name} failed`);
    } else if (r.status === "WARNING") {
      warningChecks.push(r.name);
      if (failOn === "warning") {
        reasons.push(`${r.name} warning`);
      }
    }
  }

  if (minScore > 0 && overallScore < minScore) {
    reasons.push(`Overall score ${overallScore} is below minimum required score ${minScore}`);
  }

  const passed =
    failingChecks.length === 0 &&
    (failOn !== "warning" || warningChecks.length === 0) &&
    (minScore === 0 || overallScore >= minScore);

  return {
    passed,
    reasons,
    failingChecks,
    warningChecks,
  };
}

export function calculateOverallScore(results: CheckResult[]): number {
  const scored = results.filter((result) => result.status === "PASS" || result.status === "FAIL" || result.status === "WARNING");

  if (!scored.length) return 0;

  const weighted = scored.flatMap((result) =>
    WEIGHTED.has(result.name)
      ? [resultScore(result), resultScore(result)]
      : [resultScore(result)],
  );

  return Math.round(
    weighted.reduce((sum, score) => sum + score, 0) / weighted.length,
  );
}

export interface ReportOptions {
  html?: boolean;
  json?: boolean;
  markdown?: boolean;
  pdf?: boolean;
}

export async function generateReports(
  report: AuditReport,
  reportDir: string,
  options: ReportOptions = {},
): Promise<{ html: string; json: string; markdown: string; pdf: string }> {

  let html = "";
  let json = "";
  let markdown = "";
  let pdf = "";

  if (options.html !== false) {
    html = await writeHtmlReport(report, reportDir);
  }

  if (options.json !== false) {
    json = await writeJsonReport(report, reportDir);
  }

  if (options.markdown !== false) {
    markdown = await writeMarkdownReport(report, reportDir);
  }

  if (options.pdf !== false) {
    try {
      pdf = await writePdfReport(report, reportDir);
    } catch {
      console.error("PDF generation failed");
    }
  }

  return {
    html,
    json,
    markdown,
    pdf,
  };
}
