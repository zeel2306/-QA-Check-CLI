import fs from "fs/promises";
import path from "path";
function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function getStatusColor(status) {
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
function getStatusLabel(status) {
    switch (status) {
        case "PASS":
            return "Pass";
        case "WARNING":
            return "Warning";
        case "FAIL":
            return "Fail";
        case "SKIPPED":
            return "Skipped";
    }
}
function clampScore(score) {
    return Math.max(0, Math.min(score, 100));
}
function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
        return "0.0s";
    }
    const seconds = milliseconds / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
}
function formatGeneratedTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function getIssueCount(result) {
    const { data } = result;
    if (result.status === "PASS" || data === undefined) {
        return 0;
    }
    if (Array.isArray(data)) {
        return data.length;
    }
    if (!isRecord(data)) {
        return 0;
    }
    if (typeof data.totalIssues === "number") {
        return data.totalIssues;
    }
    if (Array.isArray(data.issues)) {
        return data.issues.length;
    }
    return 0;
}
function formatKey(key) {
    return key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function renderValue(value) {
    if (value === undefined || value === null || value === "") {
        return "<span class=\"muted\">None</span>";
    }
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? escape(value.toLocaleString()) : "0";
    }
    if (typeof value === "string") {
        return escape(value);
    }
    if (Array.isArray(value)) {
        if (!value.length) {
            return "<span class=\"muted\">None</span>";
        }
        return escape(value
            .slice(0, 6)
            .map((item) => (isRecord(item) ? summarizeRecord(item) : String(item)))
            .join(", "));
    }
    if (isRecord(value)) {
        return escape(summarizeRecord(value));
    }
    return escape(String(value));
}
function summarizeRecord(record) {
    const preferredKeys = ["message", "type", "route", "url", "selector", "status", "exitCode"];
    const summary = preferredKeys
        .filter((key) => record[key] !== undefined && record[key] !== "")
        .map((key) => `${formatKey(key)}: ${String(record[key])}`)
        .join(" | ");
    if (summary) {
        return summary;
    }
    return Object.entries(record)
        .slice(0, 4)
        .map(([key, value]) => `${formatKey(key)}: ${String(value)}`)
        .join(" | ");
}
function renderMetric(label, value, icon) {
    return `
    <div class="card-metric">
      <span>${escape(icon)} ${escape(label)}</span>
      <strong>${renderValue(value)}</strong>
    </div>
  `;
}
function renderDetailRow(label, value) {
    return `
    <div class="detail-row">
      <span>${escape(formatKey(label))}</span>
      <strong>${renderValue(value)}</strong>
    </div>
  `;
}
function renderIssueItem(item, index) {
    if (!isRecord(item)) {
        return `
      <li>
        <span>${renderValue(item)}</span>
      </li>
    `;
    }
    const primary = item.route ??
        item.file ??
        item.path ??
        item.url ??
        item.href ??
        item.selector ??
        `Item ${index + 1}`;
    const metadata = Object.entries(item)
        .filter(([key]) => !["route", "file", "path", "url", "href"].includes(key))
        .slice(0, 4)
        .map(([key, value]) => `
        <span>${escape(formatKey(key))}: ${renderValue(value)}</span>
      `)
        .join("");
    return `
    <li>
      <strong>${renderValue(primary)}</strong>
      ${metadata ? `<div>${metadata}</div>` : ""}
    </li>
  `;
}
function getIssueGroupKey(item, fallbackTitle) {
    if (!isRecord(item)) {
        return fallbackTitle;
    }
    const status = typeof item.status === "number" ? `HTTP ${item.status}` : item.status;
    const imageReason = item.alt === undefined || item.alt === ""
        ? "missing-alt"
        : typeof item.status === "number" && item.status >= 400
            ? "broken-image"
            : typeof item.bytes === "number" && item.bytes > 1_000_000
                ? "large-image"
                : undefined;
    return String(item.type ??
        imageReason ??
        item.message ??
        status ??
        fallbackTitle);
}
function getIssueUnit(title, items) {
    const normalizedTitle = title.toLowerCase();
    const firstRecord = items.find(isRecord);
    if (normalizedTitle.includes("image") || (firstRecord && "alt" in firstRecord)) {
        return items.length === 1 ? "Image" : "Images";
    }
    if (normalizedTitle.includes("link") || normalizedTitle.includes("url")) {
        return items.length === 1 ? "Link" : "Links";
    }
    if (firstRecord && ("route" in firstRecord || "viewport" in firstRecord)) {
        return items.length === 1 ? "Page" : "Pages";
    }
    if (firstRecord && ("file" in firstRecord || "path" in firstRecord)) {
        return items.length === 1 ? "File" : "Files";
    }
    return items.length === 1 ? "Item" : "Items";
}
function getIssueCollections(data, fallbackTitle) {
    if (Array.isArray(data)) {
        return data.length ? [{ title: fallbackTitle, items: data }] : [];
    }
    if (!isRecord(data)) {
        return [];
    }
    const collections = [];
    if (Array.isArray(data.issues)) {
        collections.push({ title: "Issues", items: data.issues });
    }
    for (const [key, value] of Object.entries(data)) {
        if (key === "issues" || key === "screenshots" || key === "grouped") {
            continue;
        }
        if (Array.isArray(value) && value.length > 0) {
            collections.push({ title: formatKey(key), items: value });
        }
    }
    return collections;
}
function renderIssueViewer(collections) {
    const groups = collections.flatMap((collection) => {
        const grouped = new Map();
        for (const item of collection.items) {
            const key = getIssueGroupKey(item, collection.title);
            grouped.set(key, [...(grouped.get(key) ?? []), item]);
        }
        return [...grouped.entries()].map(([key, items]) => ({
            label: formatKey(key),
            items,
            unit: getIssueUnit(collection.title === "Issues" ? key : collection.title, items),
        }));
    });
    if (!groups.length) {
        return "";
    }
    const renderedGroups = groups
        .map((group, index) => {
        const visibleItems = group.items.slice(0, 25).map(renderIssueItem).join("");
        const hiddenCount = group.items.length - 25;
        return `
        <details class="issue-group" ${index === 0 ? "open" : ""}>
          <summary>
            <span>
              <strong>${escape(group.label)}</strong>
              <small>${group.items.length} ${escape(group.unit)}</small>
            </span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <ul class="issue-list">
            ${visibleItems}
          </ul>
          ${hiddenCount > 0
            ? `<p class="detail-note">+ ${hiddenCount} more entr${hiddenCount === 1 ? "y" : "ies"} not shown</p>`
            : ""}
        </details>
      `;
    })
        .join("");
    return `
    <div class="issue-viewer">
      <div class="issue-viewer-header">
        <h3>Grouped issues</h3>
        <span>${groups.length} group${groups.length === 1 ? "" : "s"}</span>
      </div>
      ${renderedGroups}
    </div>
  `;
}
function renderReadableDetails(data, fallbackTitle) {
    if (data === undefined || data === null) {
        return `
      <div class="details-panel">
        <p class="empty-state">No additional details were reported.</p>
      </div>
    `;
    }
    if (Array.isArray(data)) {
        return `
      <div class="details-panel">
        ${renderIssueViewer(getIssueCollections(data, fallbackTitle))}
      </div>
    `;
    }
    if (!isRecord(data)) {
        return `
      <div class="details-panel">
        ${renderDetailRow("Result", data)}
      </div>
    `;
    }
    const issues = Array.isArray(data.issues) ? data.issues : undefined;
    const rows = Object.entries(data)
        .filter(([key, value]) => key !== "issues" && key !== "grouped" && !Array.isArray(value))
        .map(([key, value]) => renderDetailRow(key, value))
        .join("");
    const issueCollections = getIssueCollections(data, fallbackTitle);
    return `
    <div class="details-panel">
      ${rows ? `<div class="detail-grid">${rows}</div>` : ""}
      ${renderIssueViewer(issueCollections)}
      ${!rows && !issues && issueCollections.length === 0 ? "<p class=\"empty-state\">No additional details were reported.</p>" : ""}
    </div>
  `;
}
function list(items) {
    return items.length
        ? items.map((item) => `<li>${escape(item)}</li>`).join("")
        : "<li>None</li>";
}
function renderMetaItem(label, value) {
    return `
    <div class="meta-item">
      <span>${escape(label)}</span>
      <strong>${escape(value)}</strong>
    </div>
  `;
}
function renderScoreCircle(score, label = "Overall Score") {
    const safeScore = clampScore(score);
    return `
    <div class="score-circle" style="--score:${safeScore};">
      <div class="score-ring">
        <div class="score-value">
          <span>${safeScore}</span>
          <small>/100</small>
        </div>
      </div>
      <p>${escape(label)}</p>
    </div>
  `;
}
function renderProgress(score) {
    if (score === undefined) {
        return "";
    }
    const safeScore = clampScore(score);
    return `
    <div class="progress" aria-label="Score ${safeScore} out of 100">
      <div class="progress-bar">
        <div class="progress-fill" style="width:${safeScore}%;"></div>
      </div>
      <span class="progress-text">${safeScore}%</span>
    </div>
  `;
}
function renderHero(report) {
    return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">QA CHECK REPORT</p>
        <h1>Quality dashboard</h1>
        <p class="hero-subtitle">
          A consolidated view of project health, route coverage, executed checks,
          skipped checks, recommendations, and responsive screenshots.
        </p>
      </div>

      ${renderScoreCircle(report.overallScore)}

      <div class="hero-meta">
        ${renderMetaItem("Framework", report.framework)}
        ${renderMetaItem("Language", report.language ?? "Unknown")}
        ${renderMetaItem("Package Manager", report.packageManager ?? "None detected")}
        ${renderMetaItem("Pages", report.routes.length)}
        ${renderMetaItem("Duration", formatDuration(report.duration))}
        ${renderMetaItem("Pipeline", report.pipeline)}
        ${renderMetaItem("Project Path", report.projectPath)}
        ${renderMetaItem("Generated Time", formatGeneratedTime(report.finishedAt || report.startedAt))}
      </div>
    </section>
  `;
}
function renderSummaryCard(label, value, detail, tone) {
    return `
    <article class="summary-card ${tone}">
      <span>${escape(label)}</span>
      <strong>${escape(value)}</strong>
      <p>${escape(detail)}</p>
    </article>
  `;
}
function renderSummary(report) {
    const passCount = report.results.filter((result) => result.status === "PASS").length;
    const warningCount = report.results.filter((result) => result.status === "WARNING").length;
    const failCount = report.results.filter((result) => result.status === "FAIL").length;
    const skippedCount = report.results.filter((result) => result.status === "SKIPPED").length;
    const scoredResults = report.results.filter((result) => typeof result.score === "number");
    const averageScore = scoredResults.length
        ? Math.round(scoredResults.reduce((total, result) => total + clampScore(result.score), 0) /
            scoredResults.length)
        : report.overallScore;
    const totalIssues = report.results.reduce((total, result) => total + getIssueCount(result), 0);
    return `
    <section class="analytics-grid" aria-label="Dashboard analytics">
      ${renderSummaryCard("PASS checks", passCount, "Completed successfully", "pass")}
      ${renderSummaryCard("WARNING checks", warningCount, "Need review", "warning")}
      ${renderSummaryCard("FAIL checks", failCount, "Require action", "fail")}
      ${renderSummaryCard("Skipped checks", skippedCount || report.checksSkipped.length, "Not executed", "skipped")}
      ${renderSummaryCard("Average Score", `${averageScore}/100`, `${scoredResults.length} scored checks`, "score")}
      ${renderSummaryCard("Total Issues", totalIssues, "Across all checks", "issues")}
    </section>
  `;
}
function renderCheckCard(result) {
    const issueCount = getIssueCount(result);
    const statusColor = getStatusColor(result.status);
    const score = result.score === undefined ? "N/A" : clampScore(result.score);
    const statusIcon = {
        PASS: "✓",
        WARNING: "!",
        FAIL: "×",
        SKIPPED: "○",
    }[result.status];
    return `
    <article class="check-card ${result.status.toLowerCase()}">
      <div class="card-header">
        <div class="check-title">
          <span class="status-icon" style="--status-color:${statusColor};">${escape(statusIcon)}</span>
          <div>
            <h2>${escape(result.name)}</h2>
            <p>${escape(getStatusLabel(result.status))} check</p>
          </div>
        </div>

        <div class="card-actions">
          <span
            class="status-badge"
            style="--status-color:${statusColor};"
          >
            ${escape(result.status)}
          </span>
        </div>
      </div>

      <div class="card-metrics">
        ${renderMetric("Score", score, "◷")}
        ${renderMetric("Issues", issueCount, issueCount === 0 ? "✓" : "!")}
        ${renderMetric("Duration", formatDuration(result.duration), "⏱")}
      </div>

      ${renderProgress(result.score)}

      <div class="summary-block">
        <span>${issueCount === 0 ? "✓ No issues detected" : `! ${issueCount} issue${issueCount > 1 ? "s" : ""} found`}</span>
        <p>${escape(result.message ?? "No summary provided.")}</p>
      </div>

      <details>
        <summary>
          <span>Expand details</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        ${renderReadableDetails(result.data, result.name)}
      </details>
    </article>
  `;
}
function renderChecks(report) {
    return `
    <section class="section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Checks</p>
          <h2>Audit results</h2>
        </div>
        <span>${report.results.length} total</span>
      </div>

      <div class="checks-grid">
        ${report.results.map(renderCheckCard).join("")}
      </div>
    </section>
  `;
}
function renderExecutionLists(report) {
    return `
    <section class="section two-column">
      <article class="panel">
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Executed</p>
            <h2>Checks executed</h2>
          </div>
          <span>${report.checksExecuted.length}</span>
        </div>
        <ul class="clean-list">
          ${list(report.checksExecuted)}
        </ul>
      </article>

      <article class="panel">
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Skipped</p>
            <h2>Checks skipped</h2>
          </div>
          <span>${report.checksSkipped.length}</span>
        </div>
        <ul class="clean-list">
          ${list(report.checksSkipped)}
        </ul>
      </article>
    </section>
  `;
}
function renderRecommendations(report) {
    const recommendations = report.results
        .filter((result) => result.status === "FAIL" || result.status === "WARNING")
        .map((result) => `
        <li>
          <strong>${escape(result.name)}</strong>
          <span>${escape(result.message ?? "Review reported findings")}</span>
        </li>
      `)
        .join("");
    return `
    <section class="section">
      <article class="panel">
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Recommendations</p>
            <h2>Recommended next steps</h2>
          </div>
        </div>

        <ul class="recommendations">
          ${recommendations || "<li><strong>All clear</strong><span>No critical recommendations.</span></li>"}
        </ul>
      </article>
    </section>
  `;
}
function renderGallery(screenshots) {
    if (!screenshots.length) {
        return "";
    }
    const gallery = screenshots
        .map((screenshot) => {
        const fileName = path.basename(screenshot);
        return `
        <figure>
          <a href="screenshots/${escape(fileName)}" target="_blank" rel="noreferrer">
            <img loading="lazy" src="screenshots/${escape(fileName)}" alt="QA screenshot ${escape(fileName)}">
          </a>
          <figcaption>${escape(fileName)}</figcaption>
        </figure>
      `;
    })
        .join("");
    return `
    <section class="section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Gallery</p>
          <h2>Screenshot gallery</h2>
        </div>
        <span>${screenshots.length} captured</span>
      </div>

      <div class="gallery">
        ${gallery}
      </div>
    </section>
  `;
}
function getScreenshots(report) {
    const responsive = report.results.find((result) => result.name === "Responsive")
        ?.data;
    if (!isRecord(responsive) || !Array.isArray(responsive.screenshots)) {
        return [];
    }
    return responsive.screenshots.filter((screenshot) => typeof screenshot === "string");
}
function renderStyles() {
    return `
    <style>
      /* Base */
      :root {
        color-scheme: dark;
        --bg: #080b12;
        --surface: #101622;
        --surface-raised: #151d2b;
        --surface-soft: #0c111b;
        --border: #243043;
        --border-strong: #34445d;
        --text: #edf2f7;
        --text-muted: #9aa8bd;
        --text-soft: #c7d2e1;
        --accent: #39d0ff;
        --accent-strong: #7c3aed;
        --success: #22c55e;
        --warning: #f59e0b;
        --danger: #ef4444;
        --shadow: 0 18px 50px rgba(0, 0, 0, 0.36);
        --shadow-soft: 0 12px 28px rgba(0, 0, 0, 0.24);
        --radius: 18px;
        --radius-sm: 12px;
        --max-width: 1320px;
      }

      * {
        box-sizing: border-box;
      }

      html {
        min-width: 320px;
        background: var(--bg);
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        line-height: 1.5;
        background:
          radial-gradient(circle at top left, rgba(57, 208, 255, 0.16), transparent 34rem),
          linear-gradient(135deg, #080b12 0%, #0d1220 48%, #090c14 100%);
      }

      a {
        color: inherit;
      }

      .page {
        width: min(100% - 48px, var(--max-width));
        margin: 0 auto;
        padding: 40px 0;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      /* Hero */
      .hero {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) auto minmax(320px, 0.9fr);
        gap: 28px;
        align-items: stretch;
        padding: 32px;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background:
          linear-gradient(140deg, rgba(21, 29, 43, 0.96), rgba(10, 15, 25, 0.94)),
          linear-gradient(90deg, rgba(57, 208, 255, 0.18), rgba(124, 58, 237, 0.16));
        box-shadow: var(--shadow);
      }

      .hero-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .hero h1 {
        margin: 0;
        color: var(--text);
        font-size: clamp(2.2rem, 5vw, 4.6rem);
        font-weight: 850;
        line-height: 0.96;
      }

      .hero-subtitle {
        max-width: 58ch;
        margin: 20px 0 0;
        color: var(--text-soft);
        font-size: 1rem;
      }

      .hero-meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .meta-item {
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: var(--radius-sm);
        background: rgba(8, 11, 18, 0.48);
      }

      .meta-item span {
        display: block;
        color: var(--text-muted);
        font-size: 0.76rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .meta-item strong {
        display: block;
        min-width: 0;
        margin-top: 6px;
        overflow-wrap: anywhere;
        color: var(--text);
        font-size: 0.95rem;
      }

      /* Score */
      .score-circle {
        display: flex;
        min-width: 190px;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 14px;
      }

      .score-ring {
        display: grid;
        width: 172px;
        height: 172px;
        place-items: center;
        border-radius: 50%;
        background:
          radial-gradient(circle at center, var(--surface) 0 58%, transparent 59%),
          conic-gradient(
            var(--success) calc(var(--score) * 1%),
            rgba(148, 163, 184, 0.16) 0
          );
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.08),
          0 18px 38px rgba(0, 0, 0, 0.28);
      }

      .score-value {
        display: flex;
        align-items: baseline;
        gap: 4px;
      }

      .score-value span {
        color: var(--text);
        font-size: 3.6rem;
        font-weight: 850;
        line-height: 1;
      }

      .score-value small,
      .score-circle p {
        color: var(--text-muted);
        font-weight: 700;
      }

      .score-circle p {
        margin: 0;
        text-transform: uppercase;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
      }

      /* Cards */
      .analytics-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 16px;
        margin-top: 24px;
      }

      .summary-card,
      .panel,
      .check-card {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: rgba(16, 22, 34, 0.84);
        box-shadow: var(--shadow-soft);
      }

      .summary-card {
        padding: 20px;
        position: relative;
        overflow: hidden;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease;
      }

      .summary-card::before {
        position: absolute;
        inset: 0 0 auto;
        height: 3px;
        background: var(--summary-color);
        content: "";
      }

      .summary-card.pass {
        --summary-color: var(--success);
      }

      .summary-card.warning {
        --summary-color: var(--warning);
      }

      .summary-card.fail {
        --summary-color: var(--danger);
      }

      .summary-card.skipped {
        --summary-color: var(--text-muted);
      }

      .summary-card.score {
        --summary-color: var(--accent);
      }

      .summary-card.issues {
        --summary-color: var(--accent-strong);
      }

      .summary-card:hover,
      .check-card:hover,
      .gallery figure:hover {
        transform: translateY(-4px);
        border-color: var(--border-strong);
        background: rgba(21, 29, 43, 0.96);
      }

      .summary-card span {
        display: block;
        color: var(--text-muted);
        font-size: 0.78rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .summary-card strong {
        display: block;
        margin-top: 12px;
        color: var(--summary-color);
        font-size: 2rem;
        line-height: 1;
      }

      .summary-card p {
        margin: 10px 0 0;
        color: var(--text-muted);
        font-size: 0.9rem;
      }

      .panel {
        padding: 24px;
      }

      .check-card {
        display: flex;
        min-width: 0;
        min-height: 340px;
        flex-direction: column;
        padding: 24px;
        position: relative;
        overflow: hidden;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease,
          box-shadow 180ms ease;
      }

      .check-card::before {
        position: absolute;
        inset: 0 0 auto;
        height: 3px;
        background: var(--status-color, var(--border));
        content: "";
        opacity: 0.85;
      }

      .check-card.pass {
        --status-color: var(--success);
        border-top-color: var(--success);
      }

      .check-card.warning {
        --status-color: var(--warning);
        border-top-color: var(--warning);
      }

      .check-card.fail {
        --status-color: var(--danger);
        border-top-color: var(--danger);
      }

      .check-card.skipped {
        --status-color: var(--text-muted);
        border-top-color: var(--text-muted);
      }

      .card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }

      .check-title {
        display: flex;
        min-width: 0;
        align-items: flex-start;
        gap: 12px;
      }

      .card-header h2 {
        margin: 0;
        color: var(--text);
        font-size: 1.2rem;
        line-height: 1.25;
      }

      .check-title p {
        margin: 5px 0 0;
        color: var(--text-muted);
        font-size: 0.86rem;
        font-weight: 700;
      }

      .status-icon {
        display: inline-grid;
        width: 30px;
        height: 30px;
        flex: 0 0 auto;
        place-items: center;
        border: 1px solid color-mix(in srgb, var(--status-color) 46%, transparent);
        border-radius: 50%;
        color: var(--status-color);
        background: color-mix(in srgb, var(--status-color) 12%, transparent);
        font-size: 1rem;
        font-weight: 900;
        line-height: 1;
      }

      .card-actions {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 10px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border: 1px solid color-mix(in srgb, var(--status-color) 42%, transparent);
        border-radius: 999px;
        color: var(--status-color);
        background: color-mix(in srgb, var(--status-color) 14%, transparent);
        font-size: 0.72rem;
        font-weight: 850;
        text-transform: uppercase;
      }

      .status-badge::before {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--status-color);
        content: "";
      }

      .card-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 22px;
      }

      .card-metric {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 6px;
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, 0.14);
        border-radius: var(--radius-sm);
        background: rgba(8, 11, 18, 0.42);
      }

      .card-metric span {
        overflow: hidden;
        color: var(--text-muted);
        font-size: 0.72rem;
        font-weight: 850;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .card-metric strong {
        overflow: hidden;
        color: var(--text);
        font-size: 1.22rem;
        line-height: 1.1;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .summary-block {
        display: grid;
        gap: 10px;
        margin-top: 18px;
        padding: 16px;
        border: 1px solid rgba(148, 163, 184, 0.14);
        border-radius: var(--radius-sm);
        background: linear-gradient(180deg, rgba(8, 11, 18, 0.54), rgba(8, 11, 18, 0.34));
      }

      .summary-block span {
        color: var(--text);
        font-weight: 700;
      }

      .summary-block p {
        margin: 0;
        white-space: pre-line;
        color: var(--text-soft);
      }

      .muted,
      .empty-state,
      .detail-note {
        color: var(--text-muted);
      }

      details {
        margin-top: auto;
        padding-top: 18px;
      }

      summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border: 1px solid rgba(57, 208, 255, 0.26);
        border-radius: var(--radius-sm);
        background: rgba(57, 208, 255, 0.08);
        color: var(--accent);
        cursor: pointer;
        font-weight: 800;
        list-style: none;
        transition:
          color 160ms ease,
          border-color 160ms ease,
          background 160ms ease;
      }

      summary::-webkit-details-marker {
        display: none;
      }

      summary:hover {
        border-color: rgba(57, 208, 255, 0.46);
        background: rgba(57, 208, 255, 0.12);
        color: var(--text);
      }

      details[open] summary {
        border-color: rgba(57, 208, 255, 0.48);
        background: rgba(57, 208, 255, 0.14);
      }

      details[open] summary span:last-child {
        transform: rotate(180deg);
      }

      summary span:last-child {
        transition: transform 180ms ease;
      }

      .details-panel {
        display: grid;
        gap: 16px;
        margin-top: 14px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: rgba(5, 7, 13, 0.68);
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .detail-row {
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 10px;
        background: rgba(16, 22, 34, 0.62);
      }

      .detail-row span {
        display: block;
        color: var(--text-muted);
        font-size: 0.72rem;
        font-weight: 850;
        text-transform: uppercase;
      }

      .detail-row strong {
        display: block;
        min-width: 0;
        margin-top: 6px;
        overflow-wrap: anywhere;
        color: var(--text-soft);
        font-size: 0.9rem;
        font-weight: 700;
      }

      .issue-viewer {
        display: grid;
        gap: 10px;
      }

      .issue-viewer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .issue-viewer-header h3 {
        margin: 0;
        color: var(--text);
        font-size: 0.95rem;
      }

      .issue-viewer-header span {
        color: var(--text-muted);
        font-size: 0.82rem;
        font-weight: 800;
      }

      .issue-group {
        margin: 0;
        padding: 0;
      }

      .issue-group summary {
        border-color: rgba(148, 163, 184, 0.14);
        background: rgba(16, 22, 34, 0.72);
        color: var(--text);
      }

      .issue-group summary > span:first-child {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 12px;
      }

      .issue-group summary strong {
        color: var(--text);
      }

      .issue-group summary small {
        color: var(--text-muted);
        font-size: 0.78rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .issue-list {
        display: grid;
        gap: 8px;
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
      }

      .issue-list li {
        padding: 12px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 10px;
        background: rgba(16, 22, 34, 0.62);
      }

      .issue-list strong {
        color: var(--text);
      }

      .issue-list span {
        color: var(--text-soft);
      }

      .issue-list div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }

      .issue-list div span {
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.1);
        color: var(--text-muted);
        font-size: 0.78rem;
        font-weight: 700;
      }

      .detail-note,
      .empty-state {
        margin: 0;
        font-size: 0.88rem;
      }

      /* Grid */
      .section {
        margin-top: 28px;
      }

      .section-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 16px;
      }

      .section-heading.compact {
        margin-bottom: 14px;
      }

      .section-heading h2 {
        margin: 0;
        color: var(--text);
        font-size: 1.35rem;
      }

      .section-heading > span {
        color: var(--text-muted);
        font-size: 0.9rem;
        font-weight: 800;
      }

      .two-column {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .checks-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 18px;
      }

      .clean-list,
      .recommendations {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .clean-list li,
      .recommendations li {
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, 0.14);
        border-radius: var(--radius-sm);
        background: rgba(8, 11, 18, 0.42);
      }

      .recommendations li {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .recommendations strong {
        flex: 0 0 180px;
        color: var(--text);
      }

      .recommendations span {
        min-width: 0;
        color: var(--text-soft);
      }

      /* Progress */
      .progress {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 22px;
      }

      .progress-bar {
        flex: 1;
        height: 10px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.16);
      }

      .progress-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--success), var(--accent));
        transition: width 300ms ease;
      }

      .progress-text {
        width: 48px;
        color: var(--text-muted);
        font-size: 0.84rem;
        font-weight: 800;
        text-align: right;
      }

      /* Gallery */
      .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }

      .gallery figure {
        margin: 0;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: rgba(16, 22, 34, 0.84);
        box-shadow: var(--shadow-soft);
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease;
      }

      .gallery a {
        display: block;
        aspect-ratio: 16 / 10;
        overflow: hidden;
        background: var(--surface-soft);
      }

      .gallery img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 260ms ease;
      }

      .gallery figure:hover img {
        transform: scale(1.035);
      }

      .gallery figcaption {
        padding: 14px;
        overflow: hidden;
        color: var(--text-muted);
        font-size: 0.86rem;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Footer */
      .footer {
        margin-top: 34px;
        padding: 20px 0 4px;
        color: var(--text-muted);
        font-size: 0.86rem;
        text-align: center;
      }

      /* Responsive */
      @media (max-width: 1120px) {
        .hero {
          grid-template-columns: 1fr;
        }

        .score-circle {
          min-width: 0;
          align-items: flex-start;
        }

        .hero-meta,
        .analytics-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        .page {
          width: min(100% - 28px, var(--max-width));
          padding: 22px 0;
        }

        .hero,
        .panel,
        .check-card {
          padding: 20px;
        }

        .hero-meta,
        .analytics-grid,
        .two-column,
        .checks-grid {
          grid-template-columns: 1fr;
        }

        .score-ring {
          width: 142px;
          height: 142px;
        }

        .score-value span {
          font-size: 2.8rem;
        }

        .section-heading,
        .card-header,
        .recommendations li {
          align-items: flex-start;
          flex-direction: column;
        }

        .recommendations strong {
          flex-basis: auto;
        }
      }

      @media (max-width: 460px) {
        .hero h1 {
          font-size: 2rem;
        }

        .hero-subtitle {
          font-size: 0.95rem;
        }

        .card-metrics,
        .detail-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}
function renderHtml(report) {
    const screenshots = getScreenshots(report);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QA Check Report</title>
    ${renderStyles()}
  </head>
  <body>
    <main class="page">
      ${renderHero(report)}
      ${renderSummary(report)}
      ${renderExecutionLists(report)}
      ${renderChecks(report)}
      ${renderRecommendations(report)}
      ${renderGallery(screenshots)}

      <footer class="footer">
        Generated by QA Check CLI
      </footer>
    </main>
  </body>
</html>
`;
}
export async function writeHtmlReport(report, reportDir) {
    const output = path.join(reportDir, "index.html");
    const html = renderHtml(report);
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(output, html, "utf8");
    return output;
}
