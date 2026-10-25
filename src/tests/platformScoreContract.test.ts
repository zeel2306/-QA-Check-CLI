import test from "node:test";
import assert from "node:assert/strict";
import { calculateOverallScore } from "../core/report.js";

const helperUrl = new URL("../../tests/integration/platform-score-contract.mjs", import.meta.url).href;
const { assertPlatformScore } = await import(helperUrl);
function fixture(performance = 100) {
  const results: any[] = [{ name: "SEO", status: "PASS", score: 100 }, {
    name: "Lighthouse Performance", status: performance >= 90 ? "PASS" : "WARNING", score: performance,
    metadata: { scoredRoutes: ["/"], stopReason: "COMPLETED", cleanupErrors: [] },
    data: [{ route: "/", performance, metrics: { FCP: 1000, LCP: 1500, CLS: 0, TTFB: 2 } }],
  }];
  return { results, overallScore: calculateOverallScore(results) };
}
test("platform contract permits variable completed Lighthouse scores within metric budgets", () => {
  for (const score of [100, 94, 85]) assertPlatformScore(fixture(score), "clean", calculateOverallScore);
});
test("platform contract rejects real performance regressions and missing metric evidence", () => {
  for (const [metric, value] of [["FCP", 1801], ["LCP", 2501], ["CLS", 0.11], ["TTFB", 801], ["FCP", undefined]] as const) {
    const report = fixture(); report.results[1].data[0].metrics[metric] = value;
    assert.throws(() => assertPlatformScore(report, "clean", calculateOverallScore), /performance budget/);
  }
});
test("platform contract rejects incomplete audits, cleanup failures and fabricated totals", () => {
  assert.throws(() => assertPlatformScore(fixture(), "defect", calculateOverallScore), /Deterministic fixture score/);
  for (const change of [
    (r: any) => { r.results[1].status = "PARTIAL"; },
    (r: any) => { r.results[1].metadata.scoredRoutes = []; },
    (r: any) => { r.results[1].metadata.cleanupErrors = ["Chrome still running"]; },
    (r: any) => { r.overallScore = 0; },
    (r: any) => { r.results[0].score = 99; },
  ]) { const report = fixture(); change(report); assert.throws(() => assertPlatformScore(report, "clean", calculateOverallScore)); }
});
