# Reliability route regression validation

## Cause and fix

The failing saved run used `discoverRoutes()` to assert `/page-01`. That API returns the static page inventory, including `/page-01.html`; `discoverDeclaredApplicationRoutes()` also expands HTML extensionless aliases. The external reliability lab exists, contains `public/page-01.html`, and its HTTP server maps `/page-01` to that file. The expectation is valid for declared application routes, but the earlier assertion used the wrong inventory. This is not evidence of a new route-discovery regression.

The current source at the start of this investigation already used the declared-route API. The older source is preserved in the previous clean-install validation copy and explains the failing log. No production route-discovery behavior was changed in this task.

`reliabilityFixture.ts` creates a temporary public directory with index.html and 37 numbered pages, and removes it after each test. The first three reliability tests now run without drive letters, environment variables, or external fixtures. They retain the 38-route assertion and verify the served path, HTML path, extensionless alias, and absence of invented `/ghost` or `/public` routes. The related regressionLabFixes extensionless test uses the same fixture and no longer catches failed assertions.

## Why 288 became 282

Comparing `test-reports/lighthouse-timeouts/full-tests.log` with `test-reports/workflow-validation/tests-unrestricted.log` shows six absent cases, rather than six skips:

- Lighthouse message and metadata match actual underlying metrics.
- Duplicate URL requests deduplication in BrokenLinksCheck.
- A scanner exceeding its time budget returns PARTIAL.
- Partial findings preservation in result.
- calculateScanCoverage handles all scanner status types accurately.
- calculateOverallScore excludes SKIPPED, ERROR, and NOT_APPLICABLE from score denominator.

Four baseline/source-exclusion tests were renumbered from 10–13 to 7–10; they still run and do not change the count. The working tree already had coverageAndLighthouse.test.ts deleted before this task; its coverage assertion is present in coverageAndFormatting.test.ts. Other deduplication, partial evidence, scanner-state, and score-exclusion assertions exist in finalReliability, lab10Followup, lighthouseTimeouts, and scannerStateSemantics tests. The logs prove the inventory change, but do not establish who changed these files or their intent. No tests were deleted, skipped, or renumbered by this task.

The exact name comparison is recorded in `test-reports/workflow-validation/test-count-comparison.json`.

## Verification

Focused reliability/regression tests: 15 passed, 0 failed, 0 skipped. `npm run build` passed. Complete `npm test`: **282 tests, 282 passed, 0 failed, 0 skipped, 0 cancelled**, exit 0 (295.085 seconds). Build and complete-suite results are recorded in `test-reports/workflow-validation/regression-build-final.log` and `regression-suite-final.log`. This was a Windows/Node 22 run; actual Ubuntu Actions validation remains separate.

No commit, push, branch change, merge, or publication was performed.
