import test from "node:test";
import assert from "node:assert/strict";
import { compareWithBaseline } from "../baseline/compare.js";
import type { AuditReport, CheckResult } from "../types/result.js";

function createReport(lhPerformance: number): AuditReport {
  const lighthouseCheck: CheckResult = {
    name: "Lighthouse Performance",
    status: "PASS",
    score: lhPerformance,
    message: `3/3 page(s) audited — Performance: ${lhPerformance} | Accessibility: 65 | Best Practices: 90 | SEO: 77`,
    duration: 100,
    metadata: {
      categoryScores: {
        performance: lhPerformance,
        accessibility: 65,
        bestPractices: 90,
        seo: 77,
      },
    },
    data: [
      { route: "/", performance: lhPerformance, accessibility: 65, bestPractices: 90, seo: 77 },
      { route: "/contact", performance: lhPerformance, accessibility: 65, bestPractices: 90, seo: 77 },
      { route: "/products", performance: lhPerformance, accessibility: 65, bestPractices: 90, seo: 77 },
    ],
  };

  return {
    version: 2,
    projectPath: "/test",
    framework: "React",
    pipeline: "React",
    checksExecuted: ["Lighthouse Performance"],
    checksSkipped: [],
    routes: ["/", "/contact", "/products"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: lhPerformance,
    results: [lighthouseCheck],
  };
}

test("Lighthouse metric small fluctuation (55 -> 53) is STABLE and does not create NEW/FIXED issue pairs", () => {
  const previous = createReport(55);
  const current = createReport(53);

  const baseline = compareWithBaseline(current, previous);
  assert.ok(baseline, "Baseline comparison should exist");

  const newIssues = baseline.categorizedIssues.newIssues;
  const fixedIssues = baseline.categorizedIssues.fixedIssues;

  assert.equal(newIssues.length, 0, "Small Lighthouse score change must NOT create NEW ISSUES");
  assert.equal(fixedIssues.length, 0, "Small Lighthouse score change must NOT create FIXED ISSUES");

  const perfMetric = baseline.metricChanges?.find((m) => m.name === "Lighthouse Performance");
  assert.ok(perfMetric, "Should include Lighthouse Performance metric comparison");
  assert.equal(perfMetric.status, "STABLE", "55 -> 53 (delta -2 within tolerance 5) should be STABLE");
  assert.equal(baseline.qualityGate.passed, true, "Regression gate should PASS for stable metric fluctuation");
});

test("Lighthouse significant regression (55 -> 40) marks metric as REGRESSED and fails gate", () => {
  const previous = createReport(55);
  const current = createReport(40);

  const baseline = compareWithBaseline(current, previous);
  assert.ok(baseline);

  const perfMetric = baseline.metricChanges?.find((m) => m.name === "Lighthouse Performance");
  assert.ok(perfMetric);
  assert.equal(perfMetric.status, "REGRESSED");
  assert.equal(baseline.qualityGate.passed, false, "Regression gate should FAIL on significant metric drop");
});

test("Lighthouse metric improvement (55 -> 70) marks metric as IMPROVED", () => {
  const previous = createReport(55);
  const current = createReport(70);

  const baseline = compareWithBaseline(current, previous);
  assert.ok(baseline);

  const perfMetric = baseline.metricChanges?.find((m) => m.name === "Lighthouse Performance");
  assert.ok(perfMetric);
  assert.equal(perfMetric.status, "IMPROVED");
  assert.equal(baseline.qualityGate.passed, true);
});

test("Unchanged Lighthouse metrics are STABLE", () => {
  const previous = createReport(65);
  const current = createReport(65);

  const baseline = compareWithBaseline(current, previous);
  assert.ok(baseline);

  const perfMetric = baseline.metricChanges?.find((m) => m.name === "Lighthouse Performance");
  assert.ok(perfMetric);
  assert.equal(perfMetric.status, "STABLE");
  assert.equal(baseline.categorizedIssues.newIssues.length, 0);
  assert.equal(baseline.categorizedIssues.fixedIssues.length, 0);
});
