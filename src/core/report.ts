import type { AuditReport, CheckResult } from "../types/result.js";
import { writeHtmlReport } from "../reporters/html.js";
import { writeJsonReport } from "../reporters/json.js";
import { writePdfReport } from "../reporters/pdf.js";

const WEIGHTED = new Set(["SEO", "Lighthouse", "Accessibility", "Performance"]);

export function calculateOverallScore(results: CheckResult[]): number {
  const scored = results.filter((result) => result.score !== undefined && WEIGHTED.has(result.name));
  if (scored.length) return Math.round(scored.reduce((sum, result) => sum + (result.score ?? 0), 0) / scored.length);
  const completed = results.filter((result) => result.status !== "SKIPPED");
  return completed.length ? Math.round(completed.reduce((sum, result) => sum + (result.status === "PASS" ? 100 : result.status === "WARNING" ? 60 : 0), 0) / completed.length) : 0;
}
export interface ReportOptions {
  html?: boolean;
  json?: boolean;
  pdf?: boolean;
}
export async function generateReports(
  report: AuditReport,
  reportDir: string,
  options: ReportOptions = {},
): Promise<{ html: string; json: string; pdf: string }> {

  let html = "";
  let json = "";
  let pdf = "";

  if (options.html !== false) {
    html = await writeHtmlReport(report, reportDir);
  }

  if (options.json !== false) {
    json = await writeJsonReport(report, reportDir);
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
    pdf,
  };
}
