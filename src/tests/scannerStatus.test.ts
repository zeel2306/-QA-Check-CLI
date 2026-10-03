import test from "node:test";
import assert from "node:assert/strict";
import { calculateOverallScore, calculateScanCoverage } from "../core/report.js";
import type { CheckResult } from "../types/result.js";

test("calculateScanCoverage handles all scanner status types accurately", () => {
  const mockResults: CheckResult[] = [
    { name: "SEO", status: "PASS", duration: 100 },
    { name: "Accessibility", status: "FAIL", duration: 100 },
    { name: "Responsive", status: "WARNING", duration: 100 },
    { name: "Lighthouse", status: "SKIPPED", duration: 0 },
    { name: "BrokenLinks", status: "ERROR", duration: 50 },
    { name: "CodeQuality", status: "NOT_APPLICABLE", duration: 0 },
  ];

  const coverage = calculateScanCoverage(mockResults);

  assert.equal(coverage.applicableScanners, 5, "NOT_APPLICABLE should be excluded from applicableScanners");
  assert.equal(coverage.executedSuccessfully, 3, "PASS, FAIL, WARNING count as executedSuccessfully");
  assert.equal(coverage.skipped, 1, "SKIPPED count should be 1");
  assert.equal(coverage.errors, 1, "ERROR count should be 1");
  assert.equal(coverage.coveragePercent, 60, "Coverage should be (3 / 5) * 100 = 60%");
});

test("calculateOverallScore excludes SKIPPED, ERROR, and NOT_APPLICABLE from score denominator", () => {
  const mockResults: CheckResult[] = [
    { name: "SEO", status: "PASS", score: 100, duration: 100 },
    { name: "Accessibility", status: "FAIL", score: 50, duration: 100 },
    { name: "Lighthouse", status: "SKIPPED", score: null, duration: 0 },
    { name: "BrokenLinks", status: "ERROR", score: null, duration: 0 },
    { name: "CodeQuality", status: "NOT_APPLICABLE", score: null, duration: 0 },
  ];

  // WEIGHTED scanners (SEO weight 2, Accessibility weight 2)
  // Total weight sum = 100*2 + 50*2 = 300. Total weights = 4. Score = 75.
  const score = calculateOverallScore(mockResults);
  assert.equal(score, 75, "Overall score should only include executed scored checks");
});
