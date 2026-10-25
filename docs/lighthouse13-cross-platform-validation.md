# Lighthouse 13.5 cross-platform release validation

Prepared on 2026-10-22 on `codex/lighthouse-13-5-experiment`. No commit, push, merge, tag, release or npm publication has been performed. Hosted execution is pending approval and a pushed commit.

## Workflow changes

- `.github/workflows/qa-check.yml`, `lab11-cicd.yml`, `lab12-package.yml`, `lab13-platform.yml`: pin the supported minimum Node 22.19.0; add the exact experimental branch to push triggers. Existing testing-branch pushes, main-targeted PRs, manual dispatch, report uploads, summaries, comments and failure handling remain.
- `.github/workflows/lab14-release.yml`: six release-validation jobs: Windows, Ubuntu and macOS × Node 22.19.0 and Node 24. Every leg installs the lockfile with `npm ci`, builds, installs the correct OS browser dependencies, runs all source tests, policy tests and Labs 11–14. Lab 14 performs fresh source AND actual external packed-consumer production audits on every leg using the unchanged `lab14-v1` policy.
- Lab 14 owns a source Chromium selection through CHROME_PATH. Consumer harnesses independently select their own installed Playwright Chromium and verify CDP readiness; source browser selection is not substituted for consumer evidence. Linux installs native dependencies through Playwright; Windows/macOS do not run Linux commands.
- Each validation retains its actual nonzero exit. Independent later validations run after earlier test failures to preserve diagnostics; earlier failures remain job failures. No continue-on-error or fallback success exists. Missing setup/build/browser evidence prevents execution and remains a failure, not a clean result. Summaries include every required step's outcome so Lab 14 READY alone cannot imply the whole matrix passed.
- All four labs' HTML/JSON/Markdown/PDF reports and workflow/source/policy logs are uploaded with always(), followed by the existing safe owned-process/file cleanup semantics. Lab 14's existing cleanup still runs before the upload and removes only its private temporary tree, never workspace reports.
- The combined job timeout is 60 minutes because it now runs the source suite and four harnesses sequentially; scanner, route and harness command timeouts are unchanged. The separate workflows remain available for focused diagnostics.
- Three additional runtime-compatibility jobs reuse the actual-tarball harness on each OS. Active build/validation runs on Node 24; Node 22.19 and Node 20 executable paths are recorded by setup-node. The negative test uses Node 20's bundled npm across its explicit runtime probes, so a future npm Node-minimum change cannot be confused with QA Check's own rejection. The main release matrix independently uses each selected runtime's normal npm. Node 20 is exclusively a negative case: help/version/scan must reject before initialization and engine-strict installation must fail with EBADENGINE. No normal source/scanner validation runs on Node 20.

Node 24 is selected by major; each run records the exact runtime and architecture in diagnostic JSON. Node 22 is pinned to 22.19.0 so no runner can silently select 22.14 or another unsupported release. Both supported versions use the checked-out migrated dependency tree; no global or published qa-check CLI is used.

## Results

The preceding migration experiment verified Windows source tests (296 passed, zero failed/skipped) and two policy tests under Node 22.19.0 and Node 24.22.0; Labs 11–14 passed under Node 22.19.0 and Labs 12/14 under Node 24.22.0. Source and consumer audits were zero in both supported runtimes. Node 20.20.2 was correctly rejected. Full historical evidence and resolved first-attempt failures are documented in `lighthouse13-migration-experiment.md`.

Fresh local preparation checks and extra Windows integrations completed successfully on 2026-10-22, with evidence under ignored `test-reports/lighthouse13-cross-platform/`. No Ubuntu/macOS results are claimed from local Windows testing.

| Fresh local check | Actual result |
| --- | --- |
| Node 22.19.0 build/source suite | 296 passed, 0 failed, 0 skipped; exit 0 |
| Node 24.22.0 build/source suite | 296 passed, 0 failed, 0 skipped; exit 0 |
| Security-policy tests, both versions | 2 passed each; exit 0 |
| Node 24 Lab 11 | 100/94/100, scanner exits 0/2/0; harness exit 0 |
| Node 24 Lab 13 | 100/96/100, scanner exits 0/2/0; harness exit 0 |
| Node 22.19 Lab 14 | 100/96/100, scanner exits 0/2/0; functional/security PASS, harness exit 0 |
| Corrected Lab 12, Node 24 | 100/96, scanner exits 0/2; harness exit 0 |
| New isolation tests, both versions | 14 passed each, 0 failed/skipped |
| Fresh packed-runtime test | Node 22.19/24 strict installs and commands PASS; Node 20.20.2 version/help/scan exit 1 before initialization; engine-strict install rejected with EBADENGINE; harness exit 0 |
| Fresh production audits | Source 0 findings; actual packed consumer 0 findings; high/moderate/critical all 0; audit and tree exits 0 |
| Workflow validation | actionlint PASS for all five workflows; duplicate-key-aware YAML, Bash syntax, 22 PowerShell scripts and 10 embedded Node snippets PASS |

All recorded scenario coverage remains 100% and confidence FULL; completed Lighthouse route counts match applicable routes and no incomplete audit is accepted as PASS. Existing harnesses verified HTML, JSON, Markdown and PDF reports and expected regression comparisons. Owned temporary consumers/processes were cleaned up and source-integrity checks passed. The source audit was repeated after the fresh Lab 14 run and returned exit 0. No test was deleted or skipped, and no baseline was changed.

`local-results.json` records the fresh source/policy/Lab 11/Lab 13/Lab 14/audit exits; `path-results.json` records the new boundary tests and corrected package/runtime tests. Each case has its log and copied full report artifacts. Windows Lab 11/13 under Node 22.19 and Lab 14 under Node 24 also retain the passing earlier migration evidence referenced above; the Windows matrix is now locally covered for all four labs on both supported runtimes.

The review reproduced a test-infrastructure isolation bug in Lab 12 and the extra runtime harness: a `startsWith('..')` check rejected genuine external consumers on a different Windows drive and accepted children named `..internal`. Both now use a shared absolute-path boundary check in `lab13-support.mjs`, with 14 Windows/POSIX cases (no skips). Lab 12 also adopts Labs 13/14's canonical temporary-parent handling to avoid macOS `/var` aliases being mistaken for package symlinks and reuses the portable npm resolver. These are harness-only portability corrections; production CLI/scoring code and dependency versions are unchanged in this preparation phase.

| Platform | Node 22.19.0 | Node 24 | Hosted result |
| --- | --- | --- | --- |
| Windows | Local PASS: full tests/policy, Labs 11–14, source/consumer audits | Local PASS: full tests/policy, Labs 11–14, source/consumer audits | Pending pushed commit |
| Ubuntu | Pending runner execution | Pending runner execution | Pending pushed commit |
| macOS | Pending runner execution | Pending runner execution | Pending pushed commit |

There were no failures in the fresh local validation commands. The first local Bash syntax invocation was blocked by the sandbox's MSYS object permissions; the authorized unrestricted rerun passed. The cross-drive/dot-prefix and macOS canonical-path issues above were identified by review before hosted execution; actual Ubuntu/macOS filesystem/browser behavior remains unverified until CI runs. Lab 11's separate private development fixture still reports its known dev-tree advisories, as recorded in the migration report; it is excluded from the CLI tarball and does not change the production audit scope or release policy.

## Baselines and scoring

No baseline files, thresholds, expected scores or seeded defects were changed. Clean/recovery stay 100; Lab 11 regression stays 94, Labs 12–14 defects stay 96, with expected scanner exits 0/2/0. Lab 12's existing contract has clean and defect; recovery is covered by Labs 11/13/14. All audits require 100% coverage and FULL confidence. Full Lighthouse execution, route timeout reasons and completed-route score scoping remain intact.

The same-browser controlled comparison found Performance 100/99 unchanged across Lighthouse 12.8.2/13.5.0. Accessibility adds landmark-one-main scoring; best practices removes the old viewport/font-size audits. TTFB adaptation preserves server-response timing in ms, with whole-ms upstream rounding; navigation TTFB is separate. Existing source/consumer accessibility versions and dependency deltas are recorded in the migration report. A future baseline refresh must be justified by actual per-route findings and engine versions, not used to conceal failures. No refresh is needed for the currently passing fixture contracts.

## Release decision and approval

**NO-GO pending actual hosted evidence.** Local success and clean local audits do not establish cross-platform release readiness. Every required release and compatibility job must complete successfully with evidence; unexpected failures need investigation. No vulnerability threshold, allowlist or audit scope was changed. A release-version decision remains separate from this preparation.

The changes are intentionally uncommitted. Before approval, review `git diff`, the new migration runtime files and this report. The approval commands will explicitly stage only the migration and workflow files, excluding unrelated pre-existing untracked investigation documents and ignored reports. A push of the experimental branch triggers all five workflows automatically. Do not merge, tag, release or publish as part of validation.

Run the following yourself only after approving the prepared changes. The explicit file list includes the still-uncommitted migration implementation: pushing only workflow changes would not test Lighthouse 13.5.

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
if ((git branch --show-current) -ne 'codex/lighthouse-13-5-experiment') { throw 'Wrong branch' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff validation failed' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Review existing staged changes first' }
$releaseValidationFiles = @(
  'package.json', 'package-lock.json', 'README.md', 'bin/qa-check.js',
  'src/index.ts', 'src/checks/lighthouse.ts', 'src/core/nodeVersion.ts',
  'src/core/doctor.ts', 'src/core/lighthouseMetrics.ts',
  'src/tests/nodeVersion.test.ts', 'src/tests/lighthouseMetrics.test.ts',
  'src/tests/lighthouseTimeouts.test.ts', 'tests/integration/lab14-release.mjs',
  'tests/integration/lighthouse13-runtime.mjs',
  'tests/integration/lab12-package.mjs', 'tests/integration/lab13-support.mjs',
  'tests/integration/package-isolation.test.mjs',
  'docs/lighthouse13-migration-experiment.md',
  'docs/lighthouse13-cross-platform-validation.md',
  '.github/workflows/qa-check.yml', '.github/workflows/lab11-cicd.yml',
  '.github/workflows/lab12-package.yml', '.github/workflows/lab13-platform.yml',
  '.github/workflows/lab14-release.yml'
)
git add -- $releaseValidationFiles
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
git diff --cached --stat
git diff --cached
# Stop here and review the complete staged migration and workflows.
```

After approving that staged diff:

```powershell
git commit -m 'Validate Lighthouse 13.5 migration across supported platforms'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push -u origin codex/lighthouse-13-5-experiment
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
gh run list --branch codex/lighthouse-13-5-experiment --limit 20
```

The push is sufficient to trigger the five workflows. Existing workflows may also be manually dispatched from this ref if GitHub exposes them from the default branch; a manual dispatch is not required for the new branch trigger. Download each job's artifacts, inspect its real runtime, step outcomes, audit JSON, scenario reports and cleanup evidence before a GO decision. No merge/publish/tag/release command is included.
