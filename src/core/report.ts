import type { AuditReport, CheckResult } from "../types/result.js";
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

export function calculateOverallScore(results: CheckResult[]): number {
  const completed = results.filter((result) => result.status !== "SKIPPED");

  if (!completed.length) return 0;

  const weighted = completed.flatMap((result) =>
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
