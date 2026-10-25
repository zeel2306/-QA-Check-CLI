import test from "node:test";
import assert from "node:assert/strict";
import { lighthouseMetrics } from "../core/lighthouseMetrics.js";

test("Lighthouse 13 insight response time preserves legacy TTFB semantics and ms units", () => {
  const result = lighthouseMetrics({
    "document-latency-insight": {numericValue: 800, metricSavings: {LCP: 800}, details: {debugData: {serverResponseTime: 900, redirectDuration: 200}}},
    metrics: {details: {items: [{timeToFirstByte: 1100}]}},
    "largest-contentful-paint": {numericValue: 1200},
  });
  assert.equal(result.metrics.TTFB, 900);
  assert.equal(result.metrics.navigationTTFB, 1100);
  assert.equal(result.metrics.LCP, 1200);
  assert.match(result.metricSources.TTFB, /debugData.serverResponseTime/);
});
test("legacy reports retain response duration including zero", () => {
  for (const value of [0, 834.5]) assert.equal(lighthouseMetrics({"server-response-time": {numericValue: value}}).metrics.TTFB, value);
});
test("missing/invalid timings never become invented zeroes or estimated savings", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, "900"]) {
    const result = lighthouseMetrics({"document-latency-insight": {numericValue: 800, details: {debugData: {serverResponseTime: value}}}});
    assert.equal(result.metrics.TTFB, undefined);
    assert.equal(result.metricSources.TTFB, "UNAVAILABLE");
  }
});
