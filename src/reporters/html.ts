import fs from "fs/promises";
import path from "path";
import type { AuditReport, CheckResult } from "../types/result.js";

function escape(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function card(result: CheckResult): string {
  return `<article class="card ${result.status.toLowerCase()}"><header><h2>${escape(result.name)}</h2><span>${escape(result.status)}</span></header>${result.score === undefined ? "" : `<strong>${result.score}</strong><small>/100</small>`}<p>${escape(result.message)}</p><details><summary>Details</summary><pre>${escape(JSON.stringify(result.data, null, 2))}</pre></details></article>`;
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `<li>${escape(item)}</li>`).join("") : "<li>None</li>";
}

export async function writeHtmlReport(
  report: AuditReport,
  reportDir: string,
): Promise<string> {
  const output = path.join(reportDir, "index.html");
  const responsive = report.results.find(
    (result) => result.name === "Responsive",
  )?.data as { screenshots?: string[] } | undefined;
  const screenshots = responsive?.screenshots ?? [];
  const gallery = screenshots
    .map(
      (screenshot) =>
        `<figure><img loading="lazy" src="screenshots/${escape(path.basename(screenshot))}" alt="QA screenshot"><figcaption>${escape(path.basename(screenshot))}</figcaption></figure>`,
    )
    .join("");
  const recommendations = report.results
    .filter((result) => result.status === "FAIL" || result.status === "WARNING")
    .map(
      (result) =>
        `<li><strong>${escape(result.name)}:</strong> ${escape(result.message ?? "Review reported findings")}</li>`,
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA Check Report</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#e8eef9;background:#07111f}body{margin:0;padding:40px}.hero{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}.score{font-size:64px;font-weight:800;color:#65e6a5}.meta{color:#94a3b8}.grid,.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}.card,section.panel{background:#101d30;border:1px solid #26364d;border-radius:16px;padding:20px}.card header{display:flex;justify-content:space-between;gap:16px}.card h2{margin:0;font-size:18px}.card span{font-weight:700}.card.pass span{color:#65e6a5}.card.fail span{color:#ff7185}.card.warning span,.card.skipped span{color:#ffc857}.card strong{font-size:40px}.card p{color:#b6c2d4;min-height:24px}details{border-top:1px solid #26364d;padding-top:12px}pre{white-space:pre-wrap;max-height:360px;overflow:auto;font-size:12px}.panel{margin-top:24px}.gallery figure{margin:0}.gallery img{width:100%;border-radius:8px}.gallery figcaption{color:#94a3b8;font-size:12px;padding-top:6px}@media(max-width:600px){body{padding:20px}.hero{display:block}.score{font-size:48px}}
  </style></head><body><section class="hero"><div><h1>QA CHECK v2</h1><p class="meta">${escape(report.framework)} · ${escape(report.language ?? "Unknown language")} · ${escape(report.packageManager ?? "No package manager")} · ${report.routes.length} pages</p><p class="meta">Pipeline: ${escape(report.pipeline)} · ${escape(report.projectPath)}</p><p class="meta">${escape(report.startedAt)} · ${(report.duration / 1000).toFixed(1)} seconds</p></div><div class="score">${report.overallScore}<small>/100</small></div></section><section class="panel"><h2>Checks Executed</h2><ul>${list(report.checksExecuted)}</ul><h2>Checks Skipped</h2><ul>${list(report.checksSkipped)}</ul></section><main class="grid">${report.results.map(card).join("")}</main><section class="panel"><h2>Recommendations</h2><ul>${recommendations || "<li>No critical recommendations.</li>"}</ul></section>${gallery ? `<section class="panel"><h2>Screenshots</h2><div class="gallery">${gallery}</div></section>` : ""}</body></html>`;
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(output, html, "utf8");
  return output;
}
