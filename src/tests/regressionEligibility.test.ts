import test from "node:test";
import assert from "node:assert/strict";
import { compareWithBaseline } from "../baseline/compare.js";
import type { AuditReport, CheckResult } from "../types/result.js";

function makeReport(results: CheckResult[], score = 80): AuditReport {
  return {
    version: 2,
    projectPath: "/test-project",
    framework: "React",
    pipeline: "React",
    checksExecuted: results.map((r) => r.name),
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: score,
    results,
  };
}

test("1. Previous FAIL (Issue A) & Current FAIL (Issue A) => 0 NEW, 0 FIXED, Regression Gate PASS", () => {
  const issueA = { type: "broken-link", route: "/", url: "/missing", message: "Broken link to /missing" };

  const prev = makeReport([{ name: "Broken Links", status: "FAIL", score: 80, message: "1 broken link", duration: 10, data: { issues: [issueA] } }]);
  const cur = makeReport([{ name: "Broken Links", status: "FAIL", score: 80, message: "1 broken link", duration: 10, data: { issues: [issueA] } }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 0);
  assert.equal(comparison.qualityGate.passed, true, "Regression gate must pass when findings are unchanged");
});

test("2. Previous FAIL (Issue A) & Current FAIL (A + B) => B NEW, Regression Gate FAIL", () => {
  const issueA = { type: "broken-link", route: "/", url: "/missing-a", message: "Broken link A" };
  const issueB = { type: "broken-link", route: "/", url: "/missing-b", message: "Broken link B" };

  const prev = makeReport([{ name: "Broken Links", status: "FAIL", score: 80, duration: 10, data: { issues: [issueA] } }]);
  const cur = makeReport([{ name: "Broken Links", status: "FAIL", score: 60, duration: 10, data: { issues: [issueA, issueB] } }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 1);
  assert.equal(comparison.categorizedIssues.newIssues[0]?.url, "/missing-b");
  assert.equal(comparison.qualityGate.passed, false, "Regression gate must fail when new issues appear");
});

test("3. Previous FAIL (A + B) & Current FAIL (Issue A) => B FIXED, Regression Gate PASS", () => {
  const issueA = { type: "broken-link", route: "/", url: "/missing-a", message: "Broken link A" };
  const issueB = { type: "broken-link", route: "/", url: "/missing-b", message: "Broken link B" };

  const prev = makeReport([{ name: "Broken Links", status: "FAIL", score: 60, duration: 10, data: { issues: [issueA, issueB] } }]);
  const cur = makeReport([{ name: "Broken Links", status: "FAIL", score: 80, duration: 10, data: { issues: [issueA] } }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 1);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);
  assert.equal(comparison.qualityGate.passed, true, "Regression gate passes when issues are fixed");
});

test("4. Previous TIMEOUT & Current FAIL (30 findings) => Findings NOT NEW, comparison UNAVAILABLE", () => {
  const findings = Array.from({ length: 30 }, (_, i) => ({ type: "overflow", route: "/", message: `Overflow ${i}` }));

  const prev = makeReport([{ name: "Responsive", status: "SKIPPED", skipReason: "Timed out", duration: 120000 }]);
  const cur = makeReport([{ name: "Responsive", status: "FAIL", score: 0, duration: 500, data: { issues: findings } }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0, "Current findings from non-comparable baseline MUST NOT be marked NEW");
  assert.equal(comparison.qualityGate.passed, true, "Regression gate MUST NOT fail due to non-comparable baseline scanner");

  const state = comparison.categorizedIssues.scannerComparisonStates?.find((s) => s.checkName === "Responsive");
  assert.equal(state?.status, "UNAVAILABLE");
});

test("5. Previous FAIL (findings) & Current TIMEOUT => Findings NOT FIXED, comparison UNAVAILABLE", () => {
  const issueA = { type: "broken-link", route: "/", url: "/missing", message: "Broken link" };

  const prev = makeReport([{ name: "Broken Links", status: "FAIL", score: 80, duration: 10, data: { issues: [issueA] } }]);
  const cur = makeReport([{ name: "Broken Links", status: "SKIPPED", skipReason: "Timed out", duration: 120000 }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 0, "Baseline findings MUST NOT be marked FIXED when current scan times out");

  const state = comparison.categorizedIssues.scannerComparisonStates?.find((s) => s.checkName === "Broken Links");
  assert.equal(state?.status, "UNAVAILABLE");
});

test("6. Previous SKIPPED & Current FAIL => Comparison UNAVAILABLE", () => {
  const prev = makeReport([{ name: "Accessibility", status: "SKIPPED", duration: 0 }]);
  const cur = makeReport([{ name: "Accessibility", status: "FAIL", score: 50, duration: 100, data: { issues: [{ type: "missing-alt", route: "/" }] } }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);

  const state = comparison.categorizedIssues.scannerComparisonStates?.find((s) => s.checkName === "Accessibility");
  assert.equal(state?.status, "UNAVAILABLE");
});

test("7. Previous ERROR & Current PASS => Comparison UNAVAILABLE", () => {
  const prev = makeReport([{ name: "Build", status: "ERROR", errorReason: "Crash", duration: 0 }]);
  const cur = makeReport([{ name: "Build", status: "PASS", score: 100, duration: 100 }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 0);

  const state = comparison.categorizedIssues.scannerComparisonStates?.find((s) => s.checkName === "Build");
  assert.equal(state?.status, "UNAVAILABLE");
});

test("8. Previous PASS & Current FAIL => Regression DETECTED and Gate FAILS", () => {
  const prev = makeReport([{ name: "Broken Links", status: "PASS", score: 100, duration: 10 }]);
  const cur = makeReport([{ name: "Broken Links", status: "FAIL", score: 80, duration: 10, data: { issues: [{ type: "broken-link", route: "/", url: "/dead" }] } }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 1);
  assert.equal(comparison.qualityGate.passed, false, "PASS -> FAIL transition must fail Regression Gate");
});

test("13. Small performance timing fluctuation (2950ms -> 3020ms) => STABLE", () => {
  const prevData = { measurements: [{ route: "/", load: 2950, ttfb: 200 }] };
  const curData = { measurements: [{ route: "/", load: 3020, ttfb: 220 }] };

  const prev = makeReport([{ name: "Performance", status: "PASS", score: 100, duration: 10, data: prevData }]);
  const cur = makeReport([{ name: "Performance", status: "PASS", score: 100, duration: 10, data: curData }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);

  const metric = comparison.metricChanges?.find((m) => m.name.includes("Performance Load"));
  assert.ok(metric);
  assert.equal(metric.status, "STABLE");
  assert.equal(comparison.qualityGate.passed, true);
});

test("14. Meaningful performance degradation (2000ms -> 3200ms) => REGRESSED", () => {
  const prevData = { measurements: [{ route: "/", load: 2000, ttfb: 200 }] };
  const curData = { measurements: [{ route: "/", load: 3200, ttfb: 220 }] };

  const prev = makeReport([{ name: "Performance", status: "PASS", score: 100, duration: 10, data: prevData }]);
  const cur = makeReport([{ name: "Performance", status: "PASS", score: 100, duration: 10, data: curData }]);

  const comparison = compareWithBaseline(cur, prev);
  assert.ok(comparison);

  const metric = comparison.metricChanges?.find((m) => m.name.includes("Performance Load"));
  assert.ok(metric);
  assert.equal(metric.status, "REGRESSED");
  assert.equal(comparison.qualityGate.passed, false, "Performance degradation beyond tolerance must fail Regression Gate");
});
