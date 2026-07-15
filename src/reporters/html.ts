import fs from "fs/promises";
import path from "path";
import type { AuditReport, CheckResult, CheckStatus } from "../types/result.js";
import { getIssueSuggestions, type IssueSuggestion } from "../suggestions/index.js";

function escape(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(score, 100));
}

function formatKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function getStatusColor(status: CheckStatus): string {
  switch (status) {
    case "PASS":
      return "#22c55e";
    case "WARNING":
      return "#f59e0b";
    case "FAIL":
      return "#ef4444";
    case "SKIPPED":
      return "#94a3b8";
  }
}

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "PASS":
      return "✓";
    case "WARNING":
      return "!";
    case "FAIL":
      return "×";
    case "SKIPPED":
      return "○";
  }
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "<span class=\"muted\">None</span>";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? escape(value.toLocaleString()) : "0";
  if (typeof value === "string") return escape(value);
  if (Array.isArray(value)) return escape(`${value.length} item${value.length === 1 ? "" : "s"}`);
  if (isRecord(value)) return escape(Object.keys(value).slice(0, 4).map(formatKey).join(", "));
  return escape(String(value));
}

function getIssueCount(result: CheckResult): number {
  if (result.status === "PASS") return 0;
  const { data } = result;
  if (Array.isArray(data)) return data.length;
  if (!isRecord(data)) return 0;
  if (typeof data.totalIssues === "number") return data.totalIssues;
  if (Array.isArray(data.issues)) return data.issues.length;
  return Object.entries(data)
    .filter(([key]) => !["screenshots", "skippedRoutes", "grouped"].includes(key))
    .reduce((total, [, value]) => total + (Array.isArray(value) ? value.length : 0), 0);
}

function getScreenshots(report: AuditReport): string[] {
  const responsive = report.results.find((result) => result.name === "Responsive")?.data;
  if (!isRecord(responsive) || !Array.isArray(responsive.screenshots)) return [];
  return responsive.screenshots.filter((screenshot): screenshot is string => typeof screenshot === "string");
}

function getAnalytics(report: AuditReport) {
  const pass = report.results.filter((result) => result.status === "PASS").length;
  const warning = report.results.filter((result) => result.status === "WARNING").length;
  const fail = report.results.filter((result) => result.status === "FAIL").length;
  const skipped = report.results.filter((result) => result.status === "SKIPPED").length;
  const scored = report.results.filter((result): result is CheckResult & { score: number } => typeof result.score === "number");
  const averageScore = scored.length
    ? Math.round(scored.reduce((total, result) => total + clampScore(result.score), 0) / scored.length)
    : report.overallScore;
  const totalIssues = report.results.reduce((total, result) => total + getIssueCount(result), 0);
  const performance = report.results.find((result) => result.name === "Performance");

  return { pass, warning, fail, skipped, averageScore, totalIssues, performanceScore: performance?.score ?? 0 };
}

function getIssueGroupKey(item: unknown, fallback: string): string {
  if (!isRecord(item)) return fallback;
  if (item.type) return String(item.type);
  if (item.message) return String(item.message);
  if (item.alt === undefined || item.alt === "") return "missing-alt";
  if (typeof item.status === "number" && (item.status === 0 || item.status >= 400)) return "broken-image";
  if (typeof item.bytes === "number" && item.bytes > 1_000_000) return "large-image";
  return fallback;
}

function getIssueUnit(groupTitle: string, items: unknown[]): string {
  const firstRecord = items.find(isRecord);
  const title = groupTitle.toLowerCase();
  if (title.includes("image") || (firstRecord && "alt" in firstRecord)) return items.length === 1 ? "Image" : "Images";
  if (title.includes("link") || (firstRecord && "href" in firstRecord)) return items.length === 1 ? "Link" : "Links";
  if (firstRecord && ("route" in firstRecord || "viewport" in firstRecord)) return items.length === 1 ? "Page" : "Pages";
  if (firstRecord && ("file" in firstRecord || "path" in firstRecord)) return items.length === 1 ? "File" : "Files";
  return items.length === 1 ? "Item" : "Items";
}

function collectIssueCollections(result: CheckResult): { title: string; items: unknown[] }[] {
  const { data } = result;
  if (Array.isArray(data)) return data.length ? [{ title: result.name, items: data }] : [];
  if (!isRecord(data)) return [];

  const collections: { title: string; items: unknown[] }[] = [];
  if (Array.isArray(data.issues) && data.issues.length) collections.push({ title: "Issues", items: data.issues });

  for (const [key, value] of Object.entries(data)) {
    if (["issues", "grouped", "screenshots", "skippedRoutes"].includes(key)) continue;
    if (Array.isArray(value) && value.length) collections.push({ title: formatKey(key), items: value });
  }

  return collections;
}

function renderIssueItem(item: unknown, index: number): string {
  if (!isRecord(item)) return `<li><strong>${escape(String(item))}</strong></li>`;

  const primary = item.route ?? item.url ?? item.file ?? item.path ?? item.selector ?? `Item ${index + 1}`;
  const metadata = Object.entries(item)
    .filter(([key]) => !["route", "url", "file", "path"].includes(key))
    .slice(0, 5)
    .map(([key, value]) => `<span>${escape(formatKey(key))}: ${renderValue(value)}</span>`)
    .join("");

  return `
    <li>
      <strong>${renderValue(primary)}</strong>
      ${metadata ? `<div>${metadata}</div>` : ""}
    </li>
  `;
}

function renderSuggestion(suggestion: IssueSuggestion): string {
  return `
    <article class="suggestion-card">
      <div class="suggestion-heading">
        <span>!</span>
        <div>
          <h4>${escape(suggestion.title)}</h4>
          <small>${escape(suggestion.code)}</small>
        </div>
      </div>
      <dl>
        <dt>Problem</dt>
        <dd>${escape(suggestion.problem)}</dd>
        ${
          suggestion.whyItMatters
            ? `<dt>Why it matters</dt><dd>${escape(suggestion.whyItMatters)}</dd>`
            : ""
        }
        <dt>Suggested fix</dt>
        <dd>
          ${suggestion.suggestedFix
            .map((fix) => `<code>${escape(fix)}</code>`)
            .join("")}
        </dd>
      </dl>
    </article>
  `;
}

function renderIssueViewer(result: CheckResult): string {
  const collections = collectIssueCollections(result);
  const suggestions = getIssueSuggestions(result);

  const issueGroups = collections.flatMap((collection) => {
    const grouped = new Map<string, unknown[]>();
    for (const item of collection.items) {
      const key = getIssueGroupKey(item, collection.title);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.entries()].map(([key, items]) => ({ key, label: formatKey(key), items }));
  });

  const groupsHtml = issueGroups.length
    ? issueGroups
        .map((group, index) => {
          const unit = getIssueUnit(group.key, group.items);
          const visibleItems = group.items.slice(0, 30).map(renderIssueItem).join("");
          const hiddenCount = group.items.length - 30;
          return `
            <details class="issue-group" ${index === 0 ? "open" : ""}>
              <summary>
                <span>
                  <strong>${escape(group.label)}</strong>
                  <small>${group.items.length} ${escape(unit)}</small>
                </span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <ul class="issue-list">${visibleItems}</ul>
              ${hiddenCount > 0 ? `<p class="detail-note">+ ${hiddenCount} more entries not shown</p>` : ""}
            </details>
          `;
        })
        .join("")
    : "<p class=\"empty-state\">No grouped issues were reported for this check.</p>";

  const dataRows = isRecord(result.data)
    ? Object.entries(result.data)
        .filter(([, value]) => !Array.isArray(value) && isRecord(result.data))
        .filter(([key]) => !["grouped"].includes(key))
        .map(([key, value]) => `<div class="detail-row"><span>${escape(formatKey(key))}</span><strong>${renderValue(value)}</strong></div>`)
        .join("")
    : "";

  return `
    <div class="details-panel">
      ${dataRows ? `<div class="detail-grid">${dataRows}</div>` : ""}
      <div class="issue-viewer">
        <div class="issue-viewer-header">
          <h3>Grouped issues</h3>
          <span>${issueGroups.length} group${issueGroups.length === 1 ? "" : "s"}</span>
        </div>
        ${groupsHtml}
      </div>
      ${
        suggestions.length
          ? `<div class="suggestions"><h3>Fix suggestions</h3>${suggestions.map(renderSuggestion).join("")}</div>`
          : ""
      }
    </div>
  `;
}

function renderProgress(score?: number): string {
  if (score === undefined) return "<div class=\"progress unavailable\"><span>No score</span></div>";
  const safeScore = clampScore(score);
  return `
    <div class="progress" aria-label="Score ${safeScore} out of 100">
      <div class="progress-bar"><div class="progress-fill" style="width:${safeScore}%"></div></div>
      <span>${safeScore}%</span>
    </div>
  `;
}

function renderMeta(label: string, value: unknown): string {
  return `<div class="meta-item"><span>${escape(label)}</span><strong>${renderValue(value)}</strong></div>`;
}

function renderHero(report: AuditReport): string {
  const generated = formatDate(report.finishedAt || report.startedAt);
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">QA CHECK REPORT</p>
        <h1>Enterprise QA Dashboard</h1>
        <p>Quality signals, issues, screenshots, suggestions, and pipeline health in one production-ready report.</p>
      </div>
      <div class="score-orbit" style="--score:${clampScore(report.overallScore)}">
        <div><strong>${clampScore(report.overallScore)}</strong><span>/100</span></div>
        <small>Overall Score</small>
      </div>
      <div class="hero-meta">
        ${renderMeta("Framework", report.framework)}
        ${renderMeta("Language", report.language ?? "Unknown")}
        ${renderMeta("Package Manager", report.packageManager ?? "None")}
        ${renderMeta("Pages", report.routes.length)}
        ${renderMeta("Duration", formatDuration(report.duration))}
        ${renderMeta("Pipeline", report.pipeline)}
        ${renderMeta("Project Path", report.projectPath)}
        ${renderMeta("Generated Time", generated)}
      </div>
    </section>
  `;
}

function renderAnalytics(report: AuditReport): string {
  const analytics = getAnalytics(report);
  const cards = [
    ["PASS checks", analytics.pass, "Completed successfully", "pass"],
    ["WARNING checks", analytics.warning, "Need review", "warning"],
    ["FAIL checks", analytics.fail, "Require action", "fail"],
    ["Skipped checks", analytics.skipped || report.checksSkipped.length, "Not executed", "skipped"],
    ["Average Score", `${analytics.averageScore}/100`, "Across scored checks", "score"],
    ["Total Issues", analytics.totalIssues, "Across all checks", "issues"],
  ] as const;

  return `
    <section class="analytics-grid">
      ${cards
        .map(
          ([label, value, detail, tone]) => `
            <article class="analytics-card ${tone}">
              <span>${escape(label)}</span>
              <strong>${escape(value)}</strong>
              <p>${escape(detail)}</p>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function formatDelta(delta: number | undefined, inverse = false): string {
  if (delta === undefined) return "New";
  if (delta === 0) return "0";
  const improved = inverse ? delta < 0 : delta > 0;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} ${improved ? "↑" : "↓"}`;
}

function renderBaseline(report: AuditReport): string {
  if (!report.baseline) return "";

  const baseline = report.baseline;
  const changedChecks = baseline.checks
    .filter((check) => check.score.delta !== 0 || check.issues.delta !== 0 || check.status.changed)
    .slice(0, 12);

  return `
    <section class="section baseline-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Baseline</p>
          <h2>Comparison with previous run</h2>
        </div>
        <span>${escape(formatDate(baseline.previousRun))}</span>
      </div>
      <div class="baseline-summary">
        <article>
          <span>Previous Score</span>
          <strong>${baseline.overallScore.previous}/100</strong>
        </article>
        <article>
          <span>Current Score</span>
          <strong>${baseline.overallScore.current}/100</strong>
        </article>
        <article class="${baseline.overallScore.delta >= 0 ? "positive" : "negative"}">
          <span>Improvement</span>
          <strong>${escape(formatDelta(baseline.overallScore.delta))}</strong>
        </article>
        <article class="${baseline.totalIssues.delta <= 0 ? "positive" : "negative"}">
          <span>Total Issues</span>
          <strong>${escape(formatDelta(baseline.totalIssues.delta, true))}</strong>
        </article>
      </div>
      <div class="baseline-table">
        ${changedChecks.length
          ? changedChecks
              .map(
                (check) => `
                  <div>
                    <strong>${escape(check.name)}</strong>
                    <span>Score ${escape(formatDelta(check.score.delta))}</span>
                    <span>Issues ${escape(formatDelta(check.issues.delta, true))}</span>
                    <span>${escape(check.status.previous ?? "New")} → ${escape(check.status.current)}</span>
                  </div>
                `,
              )
              .join("")
          : "<p class=\"empty-state\">No check-level changes detected.</p>"}
      </div>
    </section>
  `;
}

function renderCharts(report: AuditReport): string {
  return `
    <section class="section">
      <div class="section-heading">
        <div><p class="eyebrow">Analytics</p><h2>Dashboard charts</h2></div>
      </div>
      <div class="charts-grid">
        <article><h3>Overall Score Gauge</h3><canvas id="overallScoreChart"></canvas></article>
        <article><h3>Check Distribution</h3><canvas id="checkDistributionChart"></canvas></article>
        <article><h3>Issue Distribution</h3><canvas id="issueDistributionChart"></canvas></article>
        <article><h3>Performance Summary</h3><canvas id="performanceSummaryChart"></canvas></article>
      </div>
    </section>
  `;
}

function renderToolbar(): string {
  return `
    <section class="toolbar">
      <label class="search-box">
        <span>Search</span>
        <input id="checkSearch" type="search" placeholder="Search by check name" autocomplete="off">
      </label>
      <div class="filters" aria-label="Status filters">
        ${["ALL", "PASS", "WARNING", "FAIL", "SKIPPED"].map((status) => `<button type="button" class="filter-button ${status === "ALL" ? "active" : ""}" data-filter="${status}">${status}</button>`).join("")}
      </div>
      <div class="actions">
        <button type="button" id="expandAll">Expand All</button>
        <button type="button" id="collapseAll">Collapse All</button>
        <button type="button" id="copyReport">Copy Report</button>
        <button type="button" id="exportJson">Export JSON</button>
      </div>
    </section>
  `;
}

function renderCheckCard(result: CheckResult): string {
  const issueCount = getIssueCount(result);
  const color = getStatusColor(result.status);
  const score = result.score === undefined ? "N/A" : clampScore(result.score);

  return `
    <article class="check-card ${result.status.toLowerCase()}" data-check-card data-name="${escape(result.name.toLowerCase())}" data-status="${result.status}">
      <header class="card-header">
        <div class="check-title">
          <span class="status-icon" style="--status-color:${color}">${escape(statusIcon(result.status))}</span>
          <div><h2>${escape(result.name)}</h2><p>${escape(result.status)} check</p></div>
        </div>
        <span class="status-badge" style="--status-color:${color}">${escape(result.status)}</span>
      </header>
      <div class="metric-row">
        <div><span>Score</span><strong>${escape(score)}</strong></div>
        <div><span>Issues</span><strong>${issueCount}</strong></div>
        <div><span>Duration</span><strong>${escape(formatDuration(result.duration))}</strong></div>
      </div>
      ${renderProgress(result.score)}
      <div class="summary-block">
        <strong>${issueCount === 0 ? "✓ No issues detected" : `! ${issueCount} issue${issueCount === 1 ? "" : "s"} found`}</strong>
        <p>${escape(result.message ?? "No summary provided.")}</p>
      </div>
      <details>
        <summary><span>Expand details</span><span aria-hidden="true">⌄</span></summary>
        ${renderIssueViewer(result)}
      </details>
    </article>
  `;
}

function renderChecks(report: AuditReport): string {
  return `
    <section class="section">
      <div class="section-heading">
        <div><p class="eyebrow">Checks</p><h2>QA checks</h2></div>
        <span id="visibleCount">${report.results.length} visible</span>
      </div>
      <main class="checks-grid" id="checksGrid">${report.results.map(renderCheckCard).join("")}</main>
    </section>
  `;
}

function renderListPanel(title: string, eyebrow: string, items: string[]): string {
  return `
    <article class="panel">
      <div class="section-heading compact"><div><p class="eyebrow">${escape(eyebrow)}</p><h2>${escape(title)}</h2></div><span>${items.length}</span></div>
      <ul class="clean-list">${items.length ? items.map((item) => `<li>${escape(item)}</li>`).join("") : "<li>None</li>"}</ul>
    </article>
  `;
}

function renderRecommendations(report: AuditReport): string {
  const items = report.results
    .filter((result) => result.status === "FAIL" || result.status === "WARNING")
    .map((result) => `<li><strong>${escape(result.name)}</strong><span>${escape(getIssueSuggestions(result)[0]?.shortFix ?? result.message ?? "Review reported findings.")}</span></li>`)
    .join("");

  return `
    <section class="section">
      <article class="panel">
        <div class="section-heading compact"><div><p class="eyebrow">Recommendations</p><h2>Recommended next steps</h2></div></div>
        <ul class="recommendations">${items || "<li><strong>All clear</strong><span>No critical recommendations.</span></li>"}</ul>
      </article>
    </section>
  `;
}

function renderGallery(screenshots: string[]): string {
  if (!screenshots.length) return "";
  return `
    <section class="section">
      <div class="section-heading">
        <div><p class="eyebrow">Gallery</p><h2>Screenshot gallery</h2></div>
        <span>${screenshots.length} image${screenshots.length === 1 ? "" : "s"}</span>
      </div>
      <div class="gallery" id="screenshotGallery">
        ${screenshots
          .map((screenshot, index) => {
            const fileName = path.basename(screenshot);
            const src = `screenshots/${escape(fileName)}`;
            return `
              <figure data-fullscreen-image="${src}" data-caption="${escape(fileName)}">
                <button type="button" aria-label="Open screenshot ${index + 1} fullscreen">
                  <img loading="lazy" src="${src}" alt="QA screenshot ${escape(fileName)}">
                </button>
                <figcaption>${escape(fileName)}</figcaption>
              </figure>
            `;
          })
          .join("")}
      </div>
    </section>
    <div class="lightbox" id="lightbox" aria-hidden="true">
      <button type="button" id="closeLightbox" aria-label="Close fullscreen screenshot">×</button>
      <img id="lightboxImage" alt="">
      <p id="lightboxCaption"></p>
    </div>
  `;
}

function chartPayload(report: AuditReport) {
  const analytics = getAnalytics(report);
  return {
    overallScore: clampScore(report.overallScore),
    checkDistribution: {
      pass: analytics.pass,
      warning: analytics.warning,
      fail: analytics.fail,
      skipped: analytics.skipped,
    },
    issueDistribution: report.results.map((result) => ({
      name: result.name,
      issues: getIssueCount(result),
    })),
    performance: report.results
      .filter((result) => typeof result.score === "number")
      .map((result) => ({ name: result.name, score: clampScore(result.score!) })),
  };
}

function renderScripts(report: AuditReport): string {
  const payload = JSON.stringify(chartPayload(report)).replace(/</g, "\\u003c");
  const reportJson = JSON.stringify(report, null, 2).replace(/</g, "\\u003c");

  return `
    <script id="report-json" type="application/json">${reportJson}</script>
    <script id="chart-data" type="application/json">${payload}</script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      (() => {
        const cards = [...document.querySelectorAll("[data-check-card]")];
        const search = document.getElementById("checkSearch");
        const visibleCount = document.getElementById("visibleCount");
        let activeFilter = "ALL";

        function applyFilters() {
          const query = (search?.value || "").trim().toLowerCase();
          let visible = 0;
          for (const card of cards) {
            const matchesName = card.dataset.name.includes(query);
            const matchesStatus = activeFilter === "ALL" || card.dataset.status === activeFilter;
            const show = matchesName && matchesStatus;
            card.hidden = !show;
            if (show) visible += 1;
          }
          if (visibleCount) visibleCount.textContent = visible + " visible";
        }

        search?.addEventListener("input", applyFilters);
        document.querySelectorAll(".filter-button").forEach((button) => {
          button.addEventListener("click", () => {
            activeFilter = button.dataset.filter || "ALL";
            document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            applyFilters();
          });
        });

        document.getElementById("expandAll")?.addEventListener("click", () => {
          document.querySelectorAll(".check-card details").forEach((details) => details.open = true);
        });
        document.getElementById("collapseAll")?.addEventListener("click", () => {
          document.querySelectorAll(".check-card details").forEach((details) => details.open = false);
        });
        document.getElementById("copyReport")?.addEventListener("click", async () => {
          const text = document.body.innerText;
          await navigator.clipboard?.writeText(text);
        });
        document.getElementById("exportJson")?.addEventListener("click", () => {
          const json = document.getElementById("report-json")?.textContent || "{}";
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "qa-check-report.json";
          link.click();
          URL.revokeObjectURL(url);
        });

        const lightbox = document.getElementById("lightbox");
        const lightboxImage = document.getElementById("lightboxImage");
        const lightboxCaption = document.getElementById("lightboxCaption");
        document.querySelectorAll("[data-fullscreen-image]").forEach((figure) => {
          figure.addEventListener("click", () => {
            lightboxImage.src = figure.dataset.fullscreenImage;
            lightboxImage.alt = figure.dataset.caption || "QA screenshot";
            lightboxCaption.textContent = figure.dataset.caption || "";
            lightbox.classList.add("open");
            lightbox.setAttribute("aria-hidden", "false");
          });
        });
        function closeLightbox() {
          lightbox?.classList.remove("open");
          lightbox?.setAttribute("aria-hidden", "true");
        }
        document.getElementById("closeLightbox")?.addEventListener("click", closeLightbox);
        lightbox?.addEventListener("click", (event) => {
          if (event.target === lightbox) closeLightbox();
        });

        document.addEventListener("keydown", (event) => {
          if (event.key === "/" && document.activeElement !== search) {
            event.preventDefault();
            search?.focus();
          }
          if (event.key.toLowerCase() === "e") document.getElementById("expandAll")?.click();
          if (event.key.toLowerCase() === "c") document.getElementById("collapseAll")?.click();
          if (event.key === "Escape") closeLightbox();
        });

        function makeCharts() {
          if (!window.Chart) return;
          const data = JSON.parse(document.getElementById("chart-data").textContent);
          const textColor = "#c7d2e1";
          const gridColor = "rgba(148, 163, 184, 0.15)";
          Chart.defaults.color = textColor;
          Chart.defaults.borderColor = gridColor;

          new Chart(document.getElementById("overallScoreChart"), {
            type: "doughnut",
            data: { labels: ["Score", "Remaining"], datasets: [{ data: [data.overallScore, 100 - data.overallScore], backgroundColor: ["#22c55e", "rgba(148,163,184,.18)"], borderWidth: 0 }] },
            options: { responsive: true, cutout: "72%", plugins: { legend: { display: false } } }
          });
          new Chart(document.getElementById("checkDistributionChart"), {
            type: "doughnut",
            data: { labels: ["PASS", "WARNING", "FAIL", "SKIPPED"], datasets: [{ data: [data.checkDistribution.pass, data.checkDistribution.warning, data.checkDistribution.fail, data.checkDistribution.skipped], backgroundColor: ["#22c55e", "#f59e0b", "#ef4444", "#94a3b8"], borderWidth: 0 }] },
            options: { responsive: true }
          });
          new Chart(document.getElementById("issueDistributionChart"), {
            type: "bar",
            data: { labels: data.issueDistribution.map((item) => item.name), datasets: [{ label: "Issues", data: data.issueDistribution.map((item) => item.issues), backgroundColor: "#7c3aed" }] },
            options: { responsive: true, scales: { x: { ticks: { maxRotation: 60 } }, y: { beginAtZero: true } } }
          });
          new Chart(document.getElementById("performanceSummaryChart"), {
            type: "radar",
            data: { labels: data.performance.map((item) => item.name), datasets: [{ label: "Score", data: data.performance.map((item) => item.score), backgroundColor: "rgba(57,208,255,.18)", borderColor: "#39d0ff", pointBackgroundColor: "#39d0ff" }] },
            options: { responsive: true, scales: { r: { min: 0, max: 100, grid: { color: gridColor }, pointLabels: { color: textColor } } } }
          });
        }

        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", makeCharts);
        else makeCharts();
      })();
    </script>
  `;
}

function renderStyles(): string {
  return `
    <style>
      /* Base */
      :root {
        color-scheme: dark;
        --bg: #080b12;
        --surface: #101622;
        --surface-raised: #151d2b;
        --surface-soft: #0c111b;
        --border: #263348;
        --border-strong: #3a4a64;
        --text: #edf2f7;
        --text-muted: #9aa8bd;
        --text-soft: #c7d2e1;
        --accent: #39d0ff;
        --accent-strong: #7c3aed;
        --success: #22c55e;
        --warning: #f59e0b;
        --danger: #ef4444;
        --shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
        --radius: 16px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * { box-sizing: border-box; }
      html { min-width: 320px; background: var(--bg); scroll-behavior: smooth; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(57, 208, 255, .14), transparent 34rem),
          linear-gradient(135deg, #080b12, #101827 54%, #080b12);
      }
      button, input { font: inherit; }
      button { cursor: pointer; }
      .page { width: min(100% - 48px, 1360px); margin: 0 auto; padding: 24px 0 40px; }
      .eyebrow { margin: 0 0 8px; color: var(--accent); font-size: .72rem; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
      .muted, .empty-state, .detail-note { color: var(--text-muted); }

      /* Header */
      .app-header {
        position: sticky;
        top: 0;
        z-index: 20;
        border-bottom: 1px solid rgba(148, 163, 184, .14);
        background: rgba(8, 11, 18, .82);
        backdrop-filter: blur(18px);
      }
      .header-inner {
        display: flex;
        width: min(100% - 48px, 1360px);
        min-height: 66px;
        margin: 0 auto;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }
      .brand strong { display: block; font-size: 1rem; }
      .brand span, .header-meta { color: var(--text-muted); font-size: .84rem; }

      /* Hero */
      .hero {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) auto minmax(320px, .9fr);
        gap: 28px;
        align-items: stretch;
        padding: 32px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: linear-gradient(140deg, rgba(21, 29, 43, .96), rgba(9, 13, 22, .94));
        box-shadow: var(--shadow);
      }
      .hero h1 { margin: 0; font-size: clamp(2.2rem, 5vw, 4.7rem); line-height: .96; }
      .hero p { max-width: 58ch; color: var(--text-soft); }
      .hero-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .meta-item { min-width: 0; padding: 14px; border: 1px solid rgba(148, 163, 184, .16); border-radius: 12px; background: rgba(8, 11, 18, .48); }
      .meta-item span { display: block; color: var(--text-muted); font-size: .72rem; font-weight: 850; text-transform: uppercase; }
      .meta-item strong { display: block; margin-top: 6px; overflow-wrap: anywhere; }
      .score-orbit { display: grid; min-width: 178px; place-items: center; align-content: center; gap: 12px; }
      .score-orbit > div {
        display: grid;
        width: 172px;
        height: 172px;
        place-items: center;
        border-radius: 50%;
        background: radial-gradient(circle at center, var(--surface) 0 58%, transparent 59%), conic-gradient(var(--success) calc(var(--score) * 1%), rgba(148, 163, 184, .18) 0);
      }
      .score-orbit strong { font-size: 3.6rem; line-height: 1; }
      .score-orbit span, .score-orbit small { color: var(--text-muted); font-weight: 800; }

      /* Analytics */
      .analytics-grid, .charts-grid, .checks-grid, .gallery, .two-column { display: grid; gap: 18px; }
      .analytics-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 24px; }
      .analytics-card, .panel, .check-card, .charts-grid article {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: rgba(16, 22, 34, .86);
        box-shadow: 0 12px 28px rgba(0, 0, 0, .22);
      }
      .analytics-card { position: relative; overflow: hidden; padding: 20px; transition: transform .18s ease, border-color .18s ease; }
      .analytics-card:hover, .check-card:hover, .gallery figure:hover { transform: translateY(-4px); border-color: var(--border-strong); }
      .analytics-card::before { position: absolute; inset: 0 0 auto; height: 3px; background: var(--tone); content: ""; }
      .analytics-card.pass { --tone: var(--success); }
      .analytics-card.warning { --tone: var(--warning); }
      .analytics-card.fail { --tone: var(--danger); }
      .analytics-card.skipped { --tone: var(--text-muted); }
      .analytics-card.score { --tone: var(--accent); }
      .analytics-card.issues { --tone: var(--accent-strong); }
      .analytics-card span { color: var(--text-muted); font-size: .76rem; font-weight: 850; text-transform: uppercase; }
      .analytics-card strong { display: block; margin-top: 10px; color: var(--tone); font-size: 2rem; }
      .analytics-card p { margin: 8px 0 0; color: var(--text-muted); }

      /* Baseline */
      .baseline-panel {
        padding: 24px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: rgba(16, 22, 34, .72);
        box-shadow: 0 12px 28px rgba(0, 0, 0, .22);
      }
      .baseline-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .baseline-summary article {
        padding: 16px;
        border: 1px solid rgba(148, 163, 184, .14);
        border-radius: 12px;
        background: rgba(8, 11, 18, .42);
      }
      .baseline-summary span,
      .baseline-table span {
        color: var(--text-muted);
        font-size: .76rem;
        font-weight: 850;
        text-transform: uppercase;
      }
      .baseline-summary strong {
        display: block;
        margin-top: 8px;
        font-size: 1.55rem;
      }
      .baseline-summary .positive strong {
        color: var(--success);
      }
      .baseline-summary .negative strong {
        color: var(--danger);
      }
      .baseline-table {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }
      .baseline-table > div {
        display: grid;
        grid-template-columns: minmax(160px, 1fr) repeat(3, minmax(90px, auto));
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, .14);
        border-radius: 12px;
        background: rgba(8, 11, 18, .42);
      }

      /* Toolbar */
      .toolbar {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) auto auto;
        gap: 14px;
        align-items: end;
        margin-top: 28px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: rgba(16, 22, 34, .72);
      }
      .search-box span { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: .75rem; font-weight: 850; text-transform: uppercase; }
      .search-box input {
        width: 100%;
        padding: 11px 13px;
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text);
        background: rgba(8, 11, 18, .82);
      }
      .filters, .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .filters button, .actions button {
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text-soft);
        background: rgba(8, 11, 18, .58);
        transition: background .16s ease, border-color .16s ease, color .16s ease;
      }
      .filters button:hover, .actions button:hover, .filters button.active {
        border-color: rgba(57, 208, 255, .5);
        color: var(--text);
        background: rgba(57, 208, 255, .12);
      }

      /* Charts */
      .section { margin-top: 30px; }
      .section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
      .section-heading h2 { margin: 0; font-size: 1.35rem; }
      .section-heading > span { color: var(--text-muted); font-weight: 800; }
      .charts-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .charts-grid article { min-height: 280px; padding: 20px; }
      .charts-grid h3 { margin: 0 0 14px; font-size: 1rem; }

      /* Cards */
      .checks-grid { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
      .check-card { position: relative; display: flex; min-width: 0; min-height: 360px; flex-direction: column; padding: 24px; overflow: hidden; transition: transform .18s ease, border-color .18s ease; }
      .check-card::before { position: absolute; inset: 0 0 auto; height: 3px; background: var(--status-color, var(--border)); content: ""; }
      .check-card.pass { --status-color: var(--success); }
      .check-card.warning { --status-color: var(--warning); }
      .check-card.fail { --status-color: var(--danger); }
      .check-card.skipped { --status-color: var(--text-muted); }
      .card-header, .check-title, .metric-row, .summary-block, .progress { display: flex; gap: 12px; }
      .card-header { align-items: flex-start; justify-content: space-between; }
      .check-title { min-width: 0; align-items: flex-start; }
      .check-title h2 { margin: 0; font-size: 1.2rem; }
      .check-title p { margin: 4px 0 0; color: var(--text-muted); font-weight: 750; }
      .status-icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border: 1px solid color-mix(in srgb, var(--status-color) 46%, transparent); border-radius: 50%; color: var(--status-color); background: color-mix(in srgb, var(--status-color) 12%, transparent); font-weight: 900; }
      .status-badge { padding: 7px 10px; border: 1px solid color-mix(in srgb, var(--status-color) 42%, transparent); border-radius: 999px; color: var(--status-color); background: color-mix(in srgb, var(--status-color) 14%, transparent); font-size: .72rem; font-weight: 850; }
      .metric-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 22px; }
      .metric-row div { padding: 12px; border: 1px solid rgba(148, 163, 184, .14); border-radius: 12px; background: rgba(8, 11, 18, .42); }
      .metric-row span { display: block; color: var(--text-muted); font-size: .72rem; font-weight: 850; text-transform: uppercase; }
      .metric-row strong { display: block; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .progress { align-items: center; margin-top: 20px; }
      .progress-bar { flex: 1; height: 10px; overflow: hidden; border-radius: 999px; background: rgba(148, 163, 184, .16); }
      .progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--success), var(--accent)); }
      .progress span { width: 48px; color: var(--text-muted); font-weight: 800; text-align: right; }
      .summary-block { display: grid; margin-top: 18px; padding: 16px; border: 1px solid rgba(148, 163, 184, .14); border-radius: 12px; background: rgba(8, 11, 18, .42); }
      .summary-block p { margin: 0; white-space: pre-line; color: var(--text-soft); }
      details { margin-top: auto; padding-top: 18px; }
      summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid rgba(57, 208, 255, .26); border-radius: 12px; color: var(--accent); background: rgba(57, 208, 255, .08); cursor: pointer; font-weight: 850; list-style: none; }
      summary::-webkit-details-marker { display: none; }
      details[open] > summary span:last-child { transform: rotate(180deg); }
      summary span:last-child { transition: transform .18s ease; }

      /* Details */
      .details-panel { display: grid; gap: 16px; margin-top: 14px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: rgba(5, 7, 13, .68); }
      .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .detail-row, .issue-list li, .suggestion-card { padding: 12px; border: 1px solid rgba(148, 163, 184, .12); border-radius: 10px; background: rgba(16, 22, 34, .62); }
      .detail-row span { display: block; color: var(--text-muted); font-size: .72rem; font-weight: 850; text-transform: uppercase; }
      .detail-row strong { display: block; margin-top: 6px; overflow-wrap: anywhere; color: var(--text-soft); }
      .issue-viewer, .suggestions { display: grid; gap: 10px; }
      .issue-viewer-header { display: flex; align-items: center; justify-content: space-between; }
      .issue-viewer-header h3, .suggestions h3 { margin: 0; font-size: .95rem; }
      .issue-viewer-header span { color: var(--text-muted); font-size: .82rem; font-weight: 800; }
      .issue-group { margin: 0; padding: 0; }
      .issue-group summary { border-color: rgba(148, 163, 184, .14); color: var(--text); background: rgba(16, 22, 34, .72); }
      .issue-group summary > span:first-child { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
      .issue-group small { color: var(--text-muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; }
      .issue-list { display: grid; gap: 8px; margin: 10px 0 0; padding: 0; list-style: none; }
      .issue-list div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .issue-list div span { padding: 4px 8px; border-radius: 999px; color: var(--text-muted); background: rgba(148, 163, 184, .1); font-size: .78rem; font-weight: 700; }
      .suggestion-heading { display: flex; gap: 10px; align-items: flex-start; }
      .suggestion-heading > span { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 50%; color: #fff; background: var(--danger); font-weight: 900; }
      .suggestion-heading h4 { margin: 0; }
      .suggestion-heading small { color: var(--text-muted); }
      .suggestion-card dl { margin: 12px 0 0; }
      .suggestion-card dt { margin-top: 10px; color: var(--text-muted); font-size: .75rem; font-weight: 850; text-transform: uppercase; }
      .suggestion-card dd { margin: 5px 0 0; color: var(--text-soft); }
      .suggestion-card code { display: block; margin-top: 6px; padding: 8px; border-radius: 8px; color: #dbeafe; background: #05070d; white-space: pre-wrap; }

      /* Lists */
      .two-column { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel { padding: 24px; }
      .clean-list, .recommendations { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
      .clean-list li, .recommendations li { padding: 12px 14px; border: 1px solid rgba(148, 163, 184, .14); border-radius: 12px; background: rgba(8, 11, 18, .42); }
      .recommendations li { display: flex; gap: 12px; }
      .recommendations strong { flex: 0 0 190px; }
      .recommendations span { color: var(--text-soft); }

      /* Gallery */
      .gallery { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
      .gallery figure { margin: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: rgba(16, 22, 34, .86); transition: transform .18s ease, border-color .18s ease; }
      .gallery button { display: block; width: 100%; padding: 0; border: 0; background: transparent; }
      .gallery img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; transition: transform .28s ease; }
      .gallery figure:hover img { transform: scale(1.055); }
      .gallery figcaption { padding: 13px; overflow: hidden; color: var(--text-muted); font-size: .86rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .lightbox { position: fixed; inset: 0; z-index: 50; display: none; place-items: center; padding: 32px; background: rgba(0, 0, 0, .84); }
      .lightbox.open { display: grid; }
      .lightbox img { max-width: min(1200px, 96vw); max-height: 82vh; border-radius: 14px; box-shadow: var(--shadow); }
      .lightbox p { color: var(--text-soft); }
      .lightbox button { position: fixed; top: 18px; right: 18px; width: 42px; height: 42px; border: 1px solid var(--border); border-radius: 50%; color: var(--text); background: var(--surface); font-size: 1.5rem; }

      /* Footer */
      .footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 34px; padding: 22px 0 4px; color: var(--text-muted); font-size: .88rem; }

      /* Print */
      @media print {
        body { color: #111827; background: #fff; }
        .app-header, .toolbar, .lightbox, script { display: none !important; }
        .page { width: 100%; padding: 0; }
        .hero, .analytics-card, .panel, .check-card, .charts-grid article { box-shadow: none; break-inside: avoid; background: #fff; color: #111827; }
        details { break-inside: avoid; }
      }

      /* Responsive */
      @media (max-width: 1180px) {
        .hero, .toolbar { grid-template-columns: 1fr; }
        .analytics-grid, .charts-grid, .baseline-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 760px) {
        .page, .header-inner { width: min(100% - 28px, 1360px); }
        .hero, .panel, .check-card { padding: 20px; }
        .hero-meta, .analytics-grid, .charts-grid, .baseline-summary, .two-column, .checks-grid, .detail-grid { grid-template-columns: 1fr; }
        .baseline-table > div { grid-template-columns: 1fr; }
        .metric-row { grid-template-columns: 1fr; }
        .section-heading, .card-header, .recommendations li, .footer { align-items: flex-start; flex-direction: column; }
      }
    </style>
  `;
}

function renderHtml(report: AuditReport): string {
  const screenshots = getScreenshots(report);
  const generated = formatDate(report.finishedAt || report.startedAt);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QA Check Report</title>
    ${renderStyles()}
  </head>
  <body>
    <header class="app-header">
      <div class="header-inner">
        <div class="brand"><strong>QA Check CLI</strong><span>Enterprise QA Dashboard</span></div>
        <div class="header-meta">Version ${escape(report.version)} · Generated ${escape(generated)}</div>
      </div>
    </header>
    <div class="page">
      ${renderHero(report)}
      ${renderAnalytics(report)}
      ${renderBaseline(report)}
      ${renderToolbar()}
      ${renderCharts(report)}
      <section class="section two-column">
        ${renderListPanel("Checks executed", "Executed", report.checksExecuted)}
        ${renderListPanel("Checks skipped", "Skipped", report.checksSkipped)}
      </section>
      ${renderChecks(report)}
      ${renderRecommendations(report)}
      ${renderGallery(screenshots)}
      <footer class="footer">
        <span>QA Check CLI v${escape(report.version)}</span>
        <span>Generated ${escape(generated)} · ${escape(report.pipeline)} · ${escape(report.projectPath)}</span>
      </footer>
    </div>
    ${renderScripts(report)}
  </body>
</html>
`;
}

export async function writeHtmlReport(
  report: AuditReport,
  reportDir: string,
): Promise<string> {
  const output = path.join(reportDir, "index.html");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(output, renderHtml(report), "utf8");
  return output;
}
