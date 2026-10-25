import assert from 'node:assert/strict';

// Package/platform integration is not a repeatable CPU benchmark. Keep the real
// score in every report; isolate its variable Lighthouse contribution only when
// checking the deterministic fixture contract. Product gates remain independent.
export function assertPlatformScore(report, scenario, calculateOverallScore) {
  const lighthouse = report.results.find(check => check.name === 'Lighthouse Performance');
  assert.ok(lighthouse, 'Missing Lighthouse evidence');
  assert.ok(['PASS', 'WARNING'].includes(lighthouse.status), 'Lighthouse must complete without failure');
  assert.ok(Number.isFinite(lighthouse.score) && lighthouse.score >= 50 && lighthouse.score <= 100);
  assert.deepEqual(lighthouse.metadata.scoredRoutes, ['/']);
  assert.equal(lighthouse.metadata.stopReason, 'COMPLETED');
  assert.deepEqual(lighthouse.metadata.cleanupErrors, []);
  assert.equal(lighthouse.data.length, 1);
  const page = lighthouse.data[0];
  assert.equal(page.route, '/');
  assert.equal(page.performance, lighthouse.score);
  for (const [metric, limit] of Object.entries({ FCP: 1800, LCP: 2500, CLS: 0.1, TTFB: 800 })) {
    assert.ok(Number.isFinite(page.metrics[metric]) && page.metrics[metric] >= 0 && page.metrics[metric] <= limit,
      `Fixture performance budget exceeded or missing: ${metric}=${page.metrics[metric]}, limit=${limit}`);
  }
  for (const check of report.results.filter(check => check !== lighthouse && typeof check.score === 'number')) {
    if (scenario === 'defect' && ['Broken Links', 'Broken Images'].includes(check.name)) continue;
    assert.equal(check.score, 100, `Unexpected deterministic scanner score: ${check.name}`);
  }
  assert.equal(report.overallScore, calculateOverallScore(report.results), 'Reported score disagrees with installed scoring implementation');
  const deterministic = report.results.map(check => check === lighthouse ? { ...check, score: 100, status: 'PASS' } : check);
  assert.equal(calculateOverallScore(deterministic), scenario === 'defect' ? 96 : 100, 'Deterministic fixture score differs from contract');
}
