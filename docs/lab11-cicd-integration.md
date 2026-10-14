# Lab 11 CI/CD integration

The separate `.github/workflows/lab11-cicd.yml` validates a real React/Vite application using the checked-out CLI on Node 22. It runs on pushes to testing-branch, pull requests targeting main, and manual dispatch. It requires only contents:read permission. The existing qa-check.yml is unchanged.

## Fixture and isolation

`tests/fixtures/lab11-cicd/` contains the original three-route app, styles, logo, HTML, TypeScript/Vite/ESLint configuration, package.json and its valid lockfile. Unavailable activation scripts were removed from the copied package.json. Linux x64 Rollup/esbuild optional packages are present in the lockfile. Dependencies, builds, reports, tsbuildinfo and original generated artifacts are excluded. It defaults to clean behavior.

The copied QA config uses the standard CI profile and no external sample API. No gate threshold is reduced, no scanner is disabled, and no incomplete evidence is accepted. The harness uses a temporary app copy for npm ci, scenario mutation, builds and serving. Only three scenario switches are activated for regression; recovery restores the original scenario source. A temporary-only network URL points at an owned ephemeral loopback server that resets connections. An initial missing-JSON URL was rejected by validation because Vite served fallback HTML with HTTP 200 instead of a failure.

## Scenario contract

1. Clean: CLI exit 0, Current Quality Gate PASSED, all three routes completed, 100% coverage and FULL confidence. Its real JSON report is retained as baseline.
2. Regression: CLI exit 2, Current Quality Gate FAILED, Regression Gate FAILED, new issues present. Broken Images, Console Errors and Network Errors must each contain their seeded evidence. The real regression report is retained.
3. Recovery: CLI exit 0, Current Quality Gate PASSED, Regression Gate PASSED against the regression report, zero new issues and nonzero fixed issues.

The harness validates report files, required scanner names, complete route evidence and gate decisions. Unexpected codes or ERROR/PARTIAL/TIMEOUT/BLOCKED/SKIPPED results fail integration. Expected CLI exit 2 is checked explicitly rather than ignored; each scenario's validation failure is recorded and causes the harness to exit 1. Available reports remain available even on failure.

All four formats (HTML, JSON, Markdown, PDF), screenshots, scenario build/server/CLI logs, fixture installation log and validation.json are uploaded by an always() artifact step. Normal completion and handled errors stop owned servers/process groups and remove the temporary app. SIGINT/SIGTERM cleanup is included. Abrupt runner loss or SIGKILL cannot guarantee post-processing; GitHub disposes of the ephemeral runner.

## Local execution

Build the CLI with `npm run build`, install Chromium with `node node_modules/playwright/cli.js install --with-deps chromium`, then run `node tests/integration/lab11-cicd.mjs`. If npm's JS entrypoint is outside the Node installation, set npm_execpath to that file. The workflow resolves this path from its actual installed npm executable rather than assuming a runner filesystem path. It sets CHROME_PATH to the installed Playwright Chromium binary.

Reports are freshly generated under `test-reports/lab11-cicd/{clean,regression,recovery}`; previous output at that dedicated path is replaced. Source files are never changed. The runner uses ephemeral ports to avoid unrelated processes.

## Validation

Local CLI build and the complete source suite passed: 282 tests, 282 passed, 0 failed, 0 skipped. Actionlint 1.7.11, YAML parsing, embedded Bash syntax and Node syntax validation passed. ShellCheck is not installed.

The final local integration completed successfully with the real production preview:

| Scenario | Score | Current gate | Regression gate | CLI exit |
| --- | --- | --- | --- | --- |
| Clean | 100 | PASSED | No baseline | 0 |
| Regression | 94 | FAILED | FAILED | 2 |
| Recovery | 100 | PASSED | PASSED | 0 |

All three audits completed all three routes with 100% scan coverage and FULL confidence. Regression detected the broken image, seeded console error and failed fetch (`net::ERR_EMPTY_RESPONSE`). Recovery produced zero new issues and confirmed fixed issues. The temporary fixture and owned preview servers were removed/stopped; report-format and cleanup verification is recorded in `test-reports/lab11-cicd/cleanup-and-reports.json`. Scenario contracts are recorded in validation.json. Source tests/build logs are under test-reports/workflow-validation.

The fixture dependency install reports 13 upstream vulnerabilities (3 moderate, 10 high). Dependencies were preserved from the existing fixture; no audit fix or unrelated package upgrades were applied.

Actual Ubuntu execution of this new workflow, Linux process-group cleanup and GitHub artifact delivery remain pending. The already successful source-validation workflow does not certify this new integration job. No commit, push, merge or npm publication was performed.
