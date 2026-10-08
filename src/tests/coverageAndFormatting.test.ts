import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import { calculateScanCoverage } from "../core/report.js";
import { writeHtmlReport } from "../reporters/html.js";
import { deduplicateFindings } from "../core/canonical.js";
import type { AuditReport, CheckResult } from "../types/result.js";

test("9. Static + runtime representation of same issue => 1 logical issue with sources ['static', 'runtime']", () => {
  const staticItem = { type: "broken-internal-link", route: "src/pages/Home.jsx", url: "/missing-route", file: "src/pages/Home.jsx" };
  const runtimeItem = { type: "broken-internal-link", route: "/", url: "http://127.0.0.1:5173/missing-route" };

  const merged = deduplicateFindings([staticItem], [runtimeItem], (item, route) => {
    const canonicalTarget = item.url.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i, "");
    return `${item.type}:${canonicalTarget}`;
  });

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]?.sources, ["static", "runtime"]);
});

test("15 & 16. Coverage denominator excludes NOT_APPLICABLE scanners but includes SKIPPED scanners", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", duration: 10 },
    { name: "Code Quality", status: "PASS", duration: 10 },
    { name: "Responsive", status: "FAIL", duration: 10 },
    { name: "Accessibility", status: "FAIL", duration: 10 },
    { name: "Lighthouse", status: "PASS", duration: 10 },
    { name: "Performance", status: "PASS", duration: 10 },
    { name: "Broken Links", status: "FAIL", duration: 10 },
    { name: "Broken Images", status: "FAIL", duration: 10 },
    { name: "Console Errors", status: "FAIL", duration: 10 },
    { name: "Network Errors", status: "FAIL", duration: 10 },
    { name: "ESLint", status: "SKIPPED", message: "No ESLint configuration found", duration: 0 },
    { name: "TypeScript", status: "NOT_APPLICABLE", message: "Project does not use TypeScript", duration: 0 },
  ];

  const cov = calculateScanCoverage(results);
  assert.equal(cov.notApplicable, 1);
  assert.equal(cov.applicableScanners, 11, "12 total - 1 NOT_APPLICABLE = 11 applicable scanners");
  assert.equal(cov.executedSuccessfully, 10, "10 executed checks");
  assert.equal(cov.skipped, 1, "1 SKIPPED check");
  assert.equal(cov.coveragePercent, 91, "10 / 11 = 91%");
});

test("17 & 18. HTML report strips ANSI codes and SKIPPED report card does NOT say 'No issues detected'", async () => {
  const report: AuditReport = {
    version: 2,
    projectPath: "/test",
    framework: "React",
    pipeline: "React",
    checksExecuted: ["ESLint"],
    checksSkipped: ["ESLint"],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: 80,
    results: [
      {
        name: "ESLint",
        status: "SKIPPED",
        message: "\u001b[36mNo ESLint configuration found\u001b[39m",
        duration: 0,
      },
    ],
  };

  const htmlPath = await writeHtmlReport(report, "./test-reports");
  const html = await fs.readFile(htmlPath, "utf8");

  assert.ok(!html.includes("\u001b[36m"), "ANSI escape codes must be stripped from HTML");
  assert.ok(html.includes("No ESLint configuration found"), "Clean message text preserved");
  assert.ok(!html.includes("✓ No issues detected"), "SKIPPED card MUST NOT state '✓ No issues detected'");
  assert.ok(html.includes("○ Check not executed"), "SKIPPED card must state '○ Check not executed'");
});
