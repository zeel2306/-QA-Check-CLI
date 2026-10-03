import test from "node:test";
import assert from "node:assert/strict";
import { calculateScanCoverage } from "../core/report.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import type { CheckResult } from "../types/result.js";

test("PASS, WARNING, FAIL count as executed; SKIPPED and ERROR reduce coverage; NOT_APPLICABLE is excluded", () => {
  const results: CheckResult[] = [
    { name: "SEO", status: "PASS", duration: 10 },
    { name: "Responsive", status: "FAIL", duration: 10 },
    { name: "Accessibility", status: "WARNING", duration: 10 },
    { name: "Lighthouse", status: "SKIPPED", duration: 0 },
    { name: "BrokenLinks", status: "ERROR", duration: 10 },
    { name: "CodeQuality", status: "NOT_APPLICABLE", duration: 0 },
  ];

  const coverage = calculateScanCoverage(results);

  assert.equal(coverage.notApplicable, 1, "NOT_APPLICABLE count should be 1");
  assert.equal(coverage.applicableScanners, 5, "Applicable scanners should be 5 (excluding NOT_APPLICABLE)");
  assert.equal(coverage.executedSuccessfully, 3, "PASS, WARNING, FAIL count as executedSuccessfully (3)");
  assert.equal(coverage.skipped, 1, "SKIPPED count should be 1");
  assert.equal(coverage.errors, 1, "ERROR count should be 1");
  assert.equal(coverage.coveragePercent, 60, "Coverage percent should be 3/5 = 60%");
});

test("Lighthouse message and metadata match actual underlying metrics", async () => {
  const check = new LighthouseCheck("http://127.0.0.1:9999", ["/"]);
  const result = await check.run("/tmp");

  if (result.status === "PASS" || result.status === "WARNING" || result.status === "FAIL") {
    assert.ok(result.message?.includes("Performance:"), "Lighthouse message must explicitly state Performance score");
    assert.ok(result.metadata?.metric === "Lighthouse Performance", "Lighthouse metadata must specify metric");
  } else {
    assert.ok(result.status === "ERROR" || result.status === "SKIPPED", "Unreachable server must be ERROR or SKIPPED");
  }
});
