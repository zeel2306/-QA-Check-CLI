import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import type { AuditReport, CheckResult, CheckStatus } from "../types/result.js";
import { getIssueSuggestions } from "../suggestions/index.js";

const COLORS = {
  ink: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  header: "#0f172a",
  accent: "#2563eb",
  pass: "#16a34a",
  warning: "#d97706",
  fail: "#dc2626",
  skipped: "#64748b",
  soft: "#f8fafc",
};

const PAGE = {
  margin: 50,
  width: 612,
  height: 792,
};

function statusColor(status: CheckStatus): string {
  switch (status) {
    case "PASS":
      return COLORS.pass;
    case "WARNING":
      return COLORS.warning;
    case "FAIL":
      return COLORS.fail;
    case "SKIPPED":
      return COLORS.skipped;
  }
}

function scoreColor(score: number): string {
  if (score >= 90) return COLORS.pass;
  if (score >= 70) return COLORS.warning;
  return COLORS.fail;
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0.0s";
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function checkScore(result: CheckResult): string {
  if (typeof result.score === "number") return String(result.score);
  if (result.status === "PASS") return "100";
  if (result.status === "WARNING") return "60";
  if (result.status === "FAIL") return "0";
  return "-";
}

function addPageHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.rect(0, 0, PAGE.width, 64).fill(COLORS.header);
  doc
    .fillColor("#ffffff")
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(title, PAGE.margin, 22);
  doc
    .fillColor("#93c5fd")
    .fontSize(9)
    .font("Helvetica")
    .text("QA Check CLI", PAGE.width - PAGE.margin - 100, 26, {
      width: 100,
      align: "right",
    });
  doc.y = 92;
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc
    .moveDown(0.5)
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(title);
  doc.moveDown(0.6);
}

function ensureSpace(doc: PDFKit.PDFDocument, required = 100): void {
  if (doc.y + required > PAGE.height - PAGE.margin) {
    doc.addPage();
    addPageHeader(doc, "QA CHECK REPORT");
  }
}

function drawCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  color = COLORS.border,
): void {
  doc
    .roundedRect(x, y, width, height, 10)
    .fillAndStroke(COLORS.soft, color);
}

function drawMetaRow(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const y = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text(label, PAGE.margin, y, { width: 150 });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(value || "N/A", PAGE.margin + 160, y, { width: 330 });
  doc.y = y + 24;
}

function drawSummaryCard(
  doc: PDFKit.PDFDocument,
  label: string,
  value: number,
  x: number,
  y: number,
  color: string,
): void {
  drawCard(doc, x, y, 118, 88, color);
  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(26)
    .text(String(value), x + 14, y + 18, { width: 90, align: "center" });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(label, x + 12, y + 56, { width: 94, align: "center" });
}

function renderCoverPage(doc: PDFKit.PDFDocument, report: AuditReport): void {
  addPageHeader(doc, "QA CHECK REPORT");
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(30)
    .text("QA CHECK REPORT", PAGE.margin, doc.y);
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(12)
    .text("Professional Quality Assurance Summary", PAGE.margin, doc.y + 8);

  doc.y += 44;
  drawMetaRow(doc, "Project", report.projectPath);
  drawMetaRow(doc, "Framework", report.framework);
  drawMetaRow(doc, "Language", report.language ?? "Unknown");
  drawMetaRow(doc, "Package Manager", report.packageManager ?? "None detected");
  drawMetaRow(doc, "Pipeline", report.pipeline);
  drawMetaRow(doc, "Generated Time", formatDate(report.finishedAt || report.startedAt));
  drawMetaRow(doc, "Duration", formatDuration(report.duration));

  const scoreY = doc.y + 28;
  const color = scoreColor(report.overallScore);
  doc.roundedRect(PAGE.margin, scoreY, 250, 130, 14).fillAndStroke("#ffffff", color);
  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(46)
    .text(`${report.overallScore} / 100`, PAGE.margin + 20, scoreY + 34, {
      width: 210,
      align: "center",
    });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("OVERALL SCORE", PAGE.margin + 20, scoreY + 88, {
      width: 210,
      align: "center",
    });
}

function renderSummaryPage(doc: PDFKit.PDFDocument, report: AuditReport): void {
  doc.addPage();
  addPageHeader(doc, "SUMMARY");
  addSectionTitle(doc, "Status Summary");

  const counts = {
    pass: report.results.filter((result) => result.status === "PASS").length,
    warning: report.results.filter((result) => result.status === "WARNING").length,
    fail: report.results.filter((result) => result.status === "FAIL").length,
    skipped: report.results.filter((result) => result.status === "SKIPPED").length,
  };

  const y = doc.y + 12;
  drawSummaryCard(doc, "PASS", counts.pass, PAGE.margin, y, COLORS.pass);
  drawSummaryCard(doc, "WARNING", counts.warning, PAGE.margin + 130, y, COLORS.warning);
  drawSummaryCard(doc, "FAIL", counts.fail, PAGE.margin + 260, y, COLORS.fail);
  drawSummaryCard(doc, "SKIPPED", counts.skipped, PAGE.margin + 390, y, COLORS.skipped);
}

function renderCheckResultsPage(doc: PDFKit.PDFDocument, report: AuditReport): void {
  doc.addPage();
  addPageHeader(doc, "CHECK RESULTS");
  addSectionTitle(doc, "Check Results");

  const columns = [PAGE.margin, 270, 370, 450];
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("CHECK", columns[0], doc.y)
    .text("STATUS", columns[1], doc.y)
    .text("SCORE", columns[2], doc.y)
    .text("DURATION", columns[3], doc.y);
  doc.moveDown(0.8);

  for (const result of report.results) {
    ensureSpace(doc, 28);
    const y = doc.y;
    doc.moveTo(PAGE.margin, y - 5).lineTo(PAGE.width - PAGE.margin, y - 5).strokeColor(COLORS.border).stroke();
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(result.name, columns[0], y, { width: 200 })
      .fillColor(statusColor(result.status))
      .font("Helvetica-Bold")
      .text(result.status, columns[1], y)
      .fillColor(COLORS.ink)
      .text(checkScore(result), columns[2], y)
      .font("Helvetica")
      .text(formatDuration(result.duration), columns[3], y);
    doc.y = y + 25;
  }
}

function renderIssuesPages(doc: PDFKit.PDFDocument, report: AuditReport): void {
  doc.addPage();
  addPageHeader(doc, "ISSUES");
  addSectionTitle(doc, "Issues and Suggested Fixes");

  const issueResults = report.results.filter(
    (result) => result.status === "FAIL" || result.status === "WARNING",
  );

  if (!issueResults.length) {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(12)
      .text("No failed or warning checks were reported.");
    return;
  }

  for (const result of issueResults) {
    ensureSpace(doc, 150);
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(result.name);
    doc.moveDown(0.4);

    const suggestions = getIssueSuggestions(result);
    for (const suggestion of suggestions) {
      ensureSpace(doc, 165);
      const startY = doc.y;
      drawCard(doc, PAGE.margin, startY, PAGE.width - PAGE.margin * 2, 140, COLORS.border);
      doc
        .fillColor(statusColor(result.status))
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(suggestion.title, PAGE.margin + 14, startY + 14, { width: 470 });
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("PROBLEM", PAGE.margin + 14, startY + 38);
      doc
        .fillColor(COLORS.ink)
        .font("Helvetica")
        .fontSize(9)
        .text(suggestion.problem, PAGE.margin + 14, startY + 50, { width: 470 });
      if (suggestion.whyItMatters) {
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica-Bold")
          .fontSize(8)
          .text("WHY IT MATTERS", PAGE.margin + 14, startY + 75);
        doc
          .fillColor(COLORS.ink)
          .font("Helvetica")
          .fontSize(9)
          .text(suggestion.whyItMatters, PAGE.margin + 14, startY + 87, { width: 470 });
      }
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("SUGGESTED FIX", PAGE.margin + 14, startY + 108);
      doc
        .fillColor(COLORS.accent)
        .font("Courier")
        .fontSize(8)
        .text(suggestion.suggestedFix.join("\n"), PAGE.margin + 14, startY + 120, { width: 470 });
      doc.y = startY + 158;
    }
  }
}

async function renderScreenshots(doc: PDFKit.PDFDocument, reportDir: string): Promise<void> {
  const screenshotsDir = path.join(reportDir, "screenshots");
  let files: string[] = [];

  try {
    files = (await fsPromises.readdir(screenshotsDir))
      .filter((file) => /\.(png|jpe?g)$/i.test(file))
      .sort();
  } catch {
    return;
  }

  if (!files.length) return;

  doc.addPage();
  addPageHeader(doc, "SCREENSHOTS");
  addSectionTitle(doc, "Responsive Screenshots");

  for (const file of files) {
    const imagePath = path.join(screenshotsDir, file);
    try {
      ensureSpace(doc, 250);
      const y = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.ink)
        .text(file, PAGE.margin, y);
      doc.image(imagePath, PAGE.margin, y + 18, {
        fit: [PAGE.width - PAGE.margin * 2, 210],
        align: "center",
        valign: "center",
      });
      doc.y = y + 250;
    } catch {
      // Skip unreadable screenshots without failing the report.
    }
  }
}

export async function writePdfReport(
  report: AuditReport,
  reportDir: string,
): Promise<string> {
  const output = path.join(reportDir, "report.pdf");
  await fsPromises.mkdir(reportDir, { recursive: true });

  await new Promise<void>(async (resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: PAGE.margin,
      autoFirstPage: false,
      info: {
        Title: "QA Check Report",
        Author: "QA Check CLI",
        Subject: `${report.framework} quality report`,
      },
    });
    const stream = fs.createWriteStream(output);

    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    try {
      doc.addPage();
      renderCoverPage(doc, report);
      renderSummaryPage(doc, report);
      renderCheckResultsPage(doc, report);
      renderIssuesPages(doc, report);
      await renderScreenshots(doc, reportDir);
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });

  return output;
}
