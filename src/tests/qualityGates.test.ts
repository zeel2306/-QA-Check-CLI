import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCurrentQualityGate } from "../core/report.js";
import { compareWithBaseline } from "../baseline/compare.js";
import type { AuditReport, CheckResult } from "../types/result.js";

test("current failing scanner => Current Quality Gate FAIL", () => {
  const mockResults: CheckResult[] = [
    { name: "Broken Links", status: "FAIL", duration: 50, message: "2 broken links" },
    { name: "SEO", status: "PASS", duration: 50 },
  ];

  const currentGate = evaluateCurrentQualityGate(mockResults, 80);

  assert.equal(currentGate.passed, false, "Current Quality Gate must be FAILED when a scanner fails");
  assert.equal(currentGate.failingChecks.length, 1);
  assert.equal(currentGate.failingChecks[0], "Broken Links");
});

test("unchanged failures vs baseline => Regression Gate may PASS while Current Quality Gate FAILS", () => {
  const currentReport: AuditReport = {
    version: 2,
    projectPath: "/tmp",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["Broken Links"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: 62,
    results: [
      { name: "Broken Links", status: "FAIL", score: 20, duration: 50, message: "2 broken links" },
      { name: "SEO", status: "PASS", score: 100, duration: 50 },
    ],
  };

  const previousReport: AuditReport = { ...currentReport };

  const baselineComparison = compareWithBaseline(currentReport, previousReport);
  const currentGate = evaluateCurrentQualityGate(currentReport.results, currentReport.overallScore);

  assert.equal(currentGate.passed, false, "Current Quality Gate must FAIL due to failing Broken Links scanner");
  assert.ok(baselineComparison, "Baseline comparison should exist");
  assert.equal(baselineComparison.qualityGate?.passed, true, "Regression Gate PASS because there were no new regressions");
});
