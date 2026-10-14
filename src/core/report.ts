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
  const executedSuccessfully = results.filter((r) => r.status === "PASS" || r.status === "FAIL" || r.status === "WARNING" || r.status === "PARTIAL");
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  const errors = results.filter((r) => r.status === "ERROR").length;
  const partial = results.filter((r) => r.status === "PARTIAL").length;
  const timedOut = results.filter((r) => r.status === "TIMEOUT").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;

  const coveragePercent = applicable.length > 0 ? Math.round((executedSuccessfully.length / applicable.length) * 100) : 0;

  return {
    applicableScanners: applicable.length,
    executedSuccessfully: executedSuccessfully.length,
    skipped,
    errors,
    notApplicable,
    partial,
    timedOut,
    blocked,
    coveragePercent,
  };
}

export function assessScoreEvidence(results: CheckResult[], score: number): NonNullable<AuditReport["scoreEvidence"]> {
  const applicable = results.filter(result => result.status !== "NOT_APPLICABLE");
  const completed = applicable.filter(result => ["PASS", "FAIL", "WARNING", "PARTIAL"].includes(result.status));
  const missingScanners = applicable.filter(result => !["PASS", "FAIL", "WARNING"].includes(result.status) || result.metadata?.incompleteScope).map(result => result.name);
  const status = !completed.length ? "INSUFFICIENT_EVIDENCE" : missingScanners.length ? "PROVISIONAL" : "COMPLETE";
  return { status, observedScore: completed.length ? score : null, missingScanners,
    warning: status === "COMPLETE" ? undefined : "INCOMPLETE AUDIT: score reflects available scanner evidence only. Unexecuted checks and routes are unknown; their defects have not been ruled out." };
}

export function evaluateCurrentQualityGate(
  results: CheckResult[],
  overallScore: number,
  options: { failOn?: "warning" | "error" | "none"; minScore?: number; profile?: string; runtime?: { minimumRouteCoveragePercent?: number } } = {}
): CurrentQualityGate {
  const failOn = options.failOn ?? "error";
  const minScore = options.minScore ?? 0;
  const isFastProfile = options.profile === "fast";
  const failingChecks: string[] = [];
  const warningChecks: string[] = [];
  const skippedChecks: string[] = [];
  const unexpectedSkips: string[] = [];
  const erroredChecks: string[] = [];
  const reasons: string[] = [];

  for (const r of results) {
    if (r.status === "FAIL" || r.status === "ERROR" || r.status === "TIMEOUT" || r.status === "BLOCKED") {
      failingChecks.push(r.name);
      if (r.status === "ERROR" || r.status === "TIMEOUT" || r.status === "BLOCKED") erroredChecks.push(r.name);
      reasons.push(`${r.name} ${r.status.toLowerCase()}`);
    } else if (r.status === "WARNING" || r.status === "PARTIAL") {
      warningChecks.push(r.name);
      if (failOn === "warning") {
        reasons.push(`${r.name} ${r.status.toLowerCase()}`);
      }
    } else if (r.status === "SKIPPED") {
      skippedChecks.push(r.name);
      const isFastSkip = isFastProfile || (r.skipReason && r.skipReason.toLowerCase().includes("fast profile"));
      if (!isFastSkip) {
        unexpectedSkips.push(r.name);
      }
    }
  }

  if (minScore > 0 && overallScore < minScore) {
    reasons.push(`Overall score ${overallScore} is below minimum required score ${minScore}`);
  }
  const minimumRouteCoverage = options.runtime?.minimumRouteCoveragePercent ?? 0;
  if (minimumRouteCoverage > 0) for (const result of results) {
    const eligible = result.pageSummary?.eligible ?? result.pagesDiscovered ?? 0;
    const completed = result.pageSummary?.completed ?? result.pagesCompleted ?? 0;
    if (eligible && completed / eligible * 100 < minimumRouteCoverage) reasons.push(`${result.name} route coverage ${Math.round(completed / eligible * 100)}% is below required ${minimumRouteCoverage}%`);
  }

  const coverage = calculateScanCoverage(results);
  const confidence: "FULL" | "PARTIAL" | "FAST_PROFILE" = isFastProfile
    ? "FAST_PROFILE"
    : coverage.coveragePercent >= 100 && coverage.partial === 0 && !results.some(result => result.metadata?.incompleteScope)
    ? "FULL"
    : "PARTIAL";
  const confidencePercent = coverage.coveragePercent;

  const hasFailures =
    reasons.some(reason => reason.includes("route coverage")) ||
    failingChecks.length > 0 ||
    (failOn === "warning" && warningChecks.length > 0) ||
    (minScore > 0 && overallScore < minScore);

  let status: "PASSED" | "FAILED" | "INCOMPLETE";
  let passed = false;

  if (hasFailures) {
    status = "FAILED";
    passed = false;
  } else if (unexpectedSkips.length > 0 || erroredChecks.length > 0 || results.some(result => result.status === "PARTIAL" || result.metadata?.incompleteScope)) {
    status = "INCOMPLETE";
    passed = false;
    const partialChecks = results.filter(result => result.status === "PARTIAL" || result.metadata?.incompleteScope).map(result => result.name);
    const count = unexpectedSkips.length + erroredChecks.length + partialChecks.length;
    const names = [...unexpectedSkips, ...erroredChecks, ...partialChecks].join(", ");
    reasons.push(`Scan is incomplete: ${count} check(s) skipped/errored/incomplete (${names})`);
  } else {
    status = "PASSED";
    passed = true;
  }

  return {
    passed,
    status,
    confidence,
    confidencePercent,
    reasons,
    failingChecks,
    warningChecks,
    skippedChecks,
    erroredChecks,
  };
}

export function calculateOverallScore(results: CheckResult[]): number {
  const scored = results.filter((result) => result.status === "PASS" || result.status === "FAIL" || result.status === "WARNING" || (result.status === "PARTIAL" && typeof result.score === "number"));

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
