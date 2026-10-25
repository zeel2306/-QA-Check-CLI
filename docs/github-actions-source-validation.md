# GitHub Actions source validation

The existing `.github/workflows/qa-check.yml` keeps its workflow/job identity, report uploads, summaries, bot-comment updates, and final failure step. It now validates repository source instead of downloading the published npm package.

## Changes

- Push trigger restricted to `testing-branch`; pull-request trigger restricted to target `main`; manual dispatch retained.
- Node.js pinned to 22, replacing the old default 20 and manual version override. npm dependency caching uses the checked-in `package-lock.json`.
- Root CLI dependencies installed with `npm ci`; source compiled with `npm run build`; complete suite executed with `npm test`. The test script already rebuilds source; that extra build remains intentional to preserve the existing script.
- Installed Playwright's local CLI installs Chromium and Ubuntu system dependencies. Lighthouse gets a verified `CHROME_PATH`, using runner Chrome or installed Playwright Chromium.
- The source entrypoint is exercised with `node ./bin/qa-check.js --help`. No root web scan or npm-published CLI is used.
- Web auditing is a separate optional operation, enabled only by the new manual `audit_project` input. It must identify an existing repository subdirectory, cannot be `.` or outside checkout, and is checked after resolving symlinks. Node applications require their own lockfile for `npm ci --prefix`; plain HTML applications need no npm install. The repository currently has no checked-in full Lab 11 application fixture, so no web target is assumed.
- Manual profile, minimum-score, report-folder, and error/warning threshold controls remain. `fail_on=none` was removed. Profile-derived audit thresholds are passed explicitly: strict fails on warnings, ci/report fail on errors. An application's `failOn=none` cannot silently disable workflow failures.
- Report output is resolved to one absolute directory inside checkout, used consistently by the CLI, report detector, summary, comment, and artifact uploader.
- Test and audit pipelines capture the real command exit code, including logging failures. Source test failures mark their step failed immediately; `always()` post-processing still uploads available artifacts. Web QA failure remains deferred until the final gate after uploads. Missing exit codes for requested audits fail instead of being treated as success.
- Summaries run even without a web report and show actual install/build/test/entrypoint outcomes and available TAP totals. They explicitly distinguish source validation from unrequested web auditing. Report summaries include ERROR, PARTIAL, TIMEOUT, BLOCKED, and NOT_APPLICABLE states.
- Same-repository PRs get an updated bot comment, including source-only results when no web report exists. Fork PRs skip comments because their tokens are normally read-only; source tests still run. No `pull_request_target` execution was introduced.
- Existing `qa-check-reports` artifact retains HTML, JSON, Markdown, PDF, screenshots, and 14-day retention. New `qa-check-validation` uploads build/test/entrypoint/audit logs and available `test-reports/**`, also with 14-day retention. No synthetic reports are created.

## Lab 11 / Ubuntu review

`src/tests/lab11Integration.test.ts` creates temporary directories under `os.tmpdir()`, uses portable path helpers, and supplies controlled browser/Lighthouse evidence. It has no `C:`/`D:` fixture dependency. Its 13 tests can be included in Ubuntu source validation without the external Vite application. Local execution passed all 13, with zero skips; this was a Windows run, not an Ubuntu certification.

`src/tests/lighthouseTimeouts.test.ts` uses temporary fixtures plus a real owned Chrome cleanup test. The workflow installs the browser and native libraries it needs. Linux process cleanup still requires the first actual Ubuntu Actions run to verify it in that environment.

Full-runtime Lab 11 helper scripts under local `test-reports/` use `D:/qa-check-testing-projects/qa-check-lab-11-cicd` and are not the portable checked-in test suite. The workflow never invokes those scripts or assumes their Windows paths exist.

Some older Angular/Vue/Express/Laravel/ground-truth and reliability-regression tests guard unavailable external lab paths and explicitly skip. `regressionLabFixes.test.ts` still catches errors/assertions around a hard-coded external fixture without recording a skip. Running `npm test` on Ubuntu does not establish full coverage of these external labs; its summary explicitly says so. No test was excluded or altered in this task, and workflow-level test failures are never ignored. Making those legacy fixture tests fully portable and improving swallowed-failure behavior remains separate test work.

## Validation performed

- YAML parsed successfully with duplicate keys rejected; triggers, unique step IDs, step references, package scripts, lockfile, local CLI entrypoint, and Playwright CLI paths verified.
- All 12 embedded Bash scripts passed `bash -n` using Git Bash.
- Four embedded Node scripts and the GitHub Script PR-comment body passed JavaScript syntax validation.
- Dry runs rejected root, parent, missing, and absolute audit paths and a disabled CI failure rule.
- Nine final-gate cases checked source success, test failure (including exit-code preservation), build/browser/entrypoint failures, QA success, QA exit 2, and a missing QA exit code.
- Source-only summary and PR-comment generation exercised locally. The GitHub API was mocked in memory; no PR comment was posted.
- Local CLI `--help` succeeded; all 13 Lab 11 regression tests passed without skips.

Validation output is under `test-reports/workflow-validation/`. These are local checks, not a remote GitHub Actions result.

## Final readiness review — 2026-10-14

Overall readiness: **FAIL pending the existing regression failure and an actual Ubuntu Actions run.**

- Actionlint 1.7.11 passed with no diagnostics. ShellCheck is unavailable and was disabled; all 12 Bash scripts separately passed `bash -n`. Five JavaScript bodies and nine final-gate scenarios passed.
- Fixed only the workflow directory guard: validate the existing ancestor before creating report directories so an external symlink cannot create output outside checkout. The traversal check now allows valid names beginning with `..`. Temporary junction tests confirmed external output rejection before creation and rejection of an audit alias pointing at the CLI root.
- Node 22.14.0: clean `npm ci` in an isolated validation directory passed (284 packages); compilation with those installed dependencies passed. The existing source build and CLI `--help` also passed.
- The installed Playwright 1.61.1 CLI accepted `install --with-deps chromium --dry-run`. The command and Ubuntu support are documented by Playwright. No Linux runtime is installed locally; actual Ubuntu native-library/browser installation remains unverified.
- Complete unrestricted `npm test`: **282 tests, 281 passed, 1 failed, 0 skipped**, exit 1. Failure: `2. A valid extensionless route resolution`, `reliabilityRegression.test.ts`, asserting that the external reliability fixture includes `/page-01`. This is a test/fixture/route-discovery issue outside this workflow-only task; it was not suppressed or changed.
- Available logs and reports use `always()` uploads before the final failure gate. Normal failures retain nonzero status. Cancellation, runner loss, or the overall 30-minute timeout can prevent post-processing.
- `contents: read` and `pull-requests: write` cover the existing checkout/comment behavior; no additional token permissions are needed. Repository policy and actual artifact/comment delivery still require remote verification.
- Dependency installation reported **32 vulnerabilities (19 moderate, 13 high)**. No dependency versions were changed.
- Lab 11's 13 repository regression tests use portable temporary fixtures/mocks; they do not provide the full external React/Vite runtime audit. Full Lab 11 CI needs a real fixture and lockfile provisioned inside checkout, then an explicit `audit_project` subdirectory.

Evidence: `npm-ci-unrestricted.log`, `clean-build.log`, `tests-unrestricted.log`, `focused-final.log`, `regression-routes.json`, `guard-final.log`, and `playwright-install-dry-run.log`. The earlier restricted run encountered local runtime access failures and is not the final test result.

## Still required

1. Review and commit/push the intended workflow and current CLI source/tests to `testing-branch` yourself. No commit, push, merge, npm publication, or remote workflow run was performed. Several recent helper/test files, including the Lab 11 regressions, are currently untracked and must be included if GitHub is to test them.
2. Run GitHub Actions on Ubuntu/Node 22 to verify dependency installation, native browser libraries, real process cleanup, artifact upload, and token permissions. Local Windows checks cannot confirm these runner-specific behaviors.
3. For the full Lab 11 Vite audit, provide a real application fixture in the checkout with its dependency lockfile, then manually dispatch with `audit_project` pointing to its subdirectory. Leaving it blank validates CLI source only and claims no web QA score.
4. Same-repository PR comments require the repository's Actions token policy to allow pull-request writes. Fork PRs intentionally receive no comment from this workflow.
