# Lab 12 — local npm tarball validation

> Historical 1.3.0 validation record. The proposed 2.0.0 release requires Node.js
> >=22.19 and addresses the build-hook/license follow-ups below. See
> [current release readiness](v2-release-readiness.md) for fresh results.

Run `node tests/integration/lab12-package.mjs` from the repository root. It builds the current source, inspects npm pack --dry-run, packs to an OS temporary directory, installs the .tgz with --omit=dev into a fresh external consumer, installs that consumer's Playwright Chromium, and exercises its installed bin. Nothing is published.

The tested artifact is qa-check-cli 1.3.0 (the product's v2 label does not change npm metadata). Package files are bin/qa-check.js, 153 compiled dist JavaScript files, README.md and package.json: 156 files, 148,832 bytes compressed and 632,744 bytes unpacked in the inspected build. The final exact size, integrity and complete file/mode/size inventory are emitted to test-reports/lab12-package/package-manifest.json. The package has an ESM main and bin mapping, no exports map, declaration files or supported library API. CLI imports resolve inside the installed package.

## Isolation and assertions

- The consumer and tarball are outside the checkout; package installation is a real copy, not npm link or a file-directory dependency. Runtime dependencies only are installed. The npm-created command shim, shebang and bin mapping are checked.
- Every CLI invocation uses the absolute installed bin with the current Node executable. No npx/global qa-check lookup occurs. NODE_PATH and NODE_OPTIONS are cleared. An ESM loader rejects file imports outside the external consumer. The installed package must contain neither src nor dist/tests. CommonJS dependency resolution starts in the independent consumer dependency tree.
- The packed-file allowlist rejects tests, reports, source maps, source TypeScript, fixtures, dependencies, .env/.npmrc and other unexpected artifacts. A high-confidence private-key/AWS-access-key/npm-token pattern check supplements the filename inspection; this is not a comprehensive secret audit. Actual tarball SHA-512 integrity is verified.
- Help aliases, doctor, init, fix --dry-run and API/test/e2e/flow empty-configuration paths run from the installed package. Configured API/E2E scenarios and every supported framework are outside this package smoke test's scope.
- Real full-profile HTML scans use an owned ephemeral HTTP server. The clean fixture includes canonical/social metadata, robots.txt and sitemap.xml required by current SEO checks. The defective fixture adds /ghost and /missing.png. Expected exits are clean 0, defective scan 2, regression compare 1 and unchanged compare 0. No gate or coverage rule is reduced. Complete execution and 100% coverage/FULL confidence are required.
- HTML, JSON, Markdown and PDF must be generated and nonempty. Reports and logs are retained under test-reports/lab12-package. That dedicated output directory is cleared before each run to prevent stale files from passing assertions. Temporary consumers/tarballs are removed in finally, and source-file hashes are compared before/after. Generated build/report/cache/browser artifacts are excluded from source hashes.

## Investigation notes and release follow-ups

The initial test harness passed a Windows filesystem path to --experimental-loader; it was corrected to a file URL. An initial HTML fixture lacked canonical/social metadata and SEO files; the scanner correctly rejected it, so the fixture was completed rather than weakening SEO. These were test setup issues, not missing packaged runtime files.

Before release, add/verify a build lifecycle hook: package.json currently has no prepack/prepare, so a manual npm pack without building can include stale dist output or omit it in a fresh checkout. This test builds explicitly, and proves the built artifact rather than certifying an unbuilt pack. MIT is declared but no LICENSE file is included; resolve license packaging before distribution. Choose the intended npm release version explicitly (current metadata remains 1.3.0). Runtime dependencies use version ranges, so clean installs can resolve newer versions than the source lockfile; installed browser versions may therefore differ from development. Browser installation/native dependencies remain explicit prerequisites. Node 22 Windows is tested here; Node 20 and Linux/macOS consumer installations remain separate validation.

The missing-build-hook risk was verified in an external disposable staging directory containing package.json, bin and README but no dist. `npm pack --dry-run --json` exited 0 and listed only those three files, with dist/index.js absent. The staging directory was removed; evidence is in test-reports/lab12-package/unbuilt-pack-proof.json. This packaging defect is reported as a release blocker rather than changing production metadata in this validation task.

The first full source-suite run during package installation had 280 passes and two smartReadiness failures (authenticated route completion and cancellation). Its log is retained as test-reports/lab12-source-suite.log; retries must not erase or suppress that result.

After the package integration completed, the isolated smartReadiness retry passed 26/26 and an unchanged full `npm test` retry passed 282/282, zero failures/skips, exit 0 (146.376 seconds). Logs are lab12-readiness-retry.log and lab12-source-suite-retry.log under test-reports. The first failures remain evidence of timing-sensitive behavior under the concurrent workload; no assertions, budgets, tests or production code were changed to obtain the retry result. `npm run build`, Node syntax checking and git diff --check also passed.

## Verified package results

The final external-consumer integration exited 0. Installed help aliases and doctor exited 0. Init created both configuration/workflow files; dry-run fix and empty API/E2E/flow paths exited 0. The real clean HTML scan scored 100 and exited 0; the seeded broken-link/image scan scored 96 and exited 2 with both defects detected and the regression gate failed. Both scans had 100% applicable coverage and FULL confidence. All four report formats were generated. Regression compare exited 1 and unchanged compare exited 0.

The actual .tgz was 148,832 bytes, 632,744 bytes unpacked, 156 files. SHA-512 integrity matched npm's manifest. The consumer installed 267 runtime packages with development dependencies omitted. No runtime files or undeclared source imports were missing in the exercised commands. Filename/content assertions found no unexpected development artifacts or high-confidence secret patterns. Cleanup removed the consumer/tarball and verified unchanged source hashes. Results, full package inventory, format reports and logs are in test-reports/lab12-package; cleanup.json records isolation/cleanup assertions. Standard npm/browser caches are retained.

## PowerShell reproduction

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
git branch --show-current
npm ci
npm run build
npm pack --dry-run --json
# Resolve npm's actual JS entrypoint; avoids npm.cmd shell ambiguity.
$env:npm_execpath = Join-Path ((npm root -g).Trim()) 'npm/bin/npm-cli.js'
node .\tests\integration\lab12-package.mjs
if ($LASTEXITCODE -ne 0) { throw 'Lab 12 failed; inspect test-reports/lab12-package' }
npm test
git diff --check
git status --short
```

The test performs the actual npm pack and installation itself, and deletes the tarball after verification. A successful tarball installation does not constitute permission to publish or merge. No commit, push, merge or npm publication is performed.

## Dedicated GitHub Actions workflow

`.github/workflows/lab12-package.yml` runs on testing-branch pushes, pull requests targeting main and manual dispatch. It uses ubuntu-latest, Node 22, npm ci, npm run build and the unchanged `node tests/integration/lab12-package.mjs` harness. The existing source-validation and Lab 11 workflows remain unchanged.

Only contents:read permission is granted. The workflow resolves npm's actual JS entrypoint, installs Chromium's native Linux libraries, then lets the external consumer's installed Playwright download its own Chromium. The tarball, consumer and browser cache live in a unique directory beneath RUNNER_TEMP outside checkout. CLI calls still use the absolute installed consumer bin with the isolation loader; no npx, global qa-check or source CLI invocation is substituted. All existing package/content/command/scan/report/coverage/exit-code assertions remain unchanged.

The harness runs in its own process session; traps stop its process group and preserve its real exit code. Always-running cleanup also handles detached processes identified by this job's unique temporary directory in their command line or working directory, validating ownership again before killing them. It checks the resolved temporary path before recursive removal. The harness's ordinary finally block still closes its HTTP server, removes its consumer/tarball and checks source hashes. Abrupt runner loss/SIGKILL can prevent cleanup steps; GitHub discards the job VM.

The always-running `lab12-package-evidence` upload retains the complete test-reports/lab12-package and test-reports/lab12-workflow directories for 14 days: package inventory/integrity, command logs, HTML/JSON/Markdown/PDF reports, screenshots, cleanup results, installation/build/browser-dependency logs and harness stdout/stderr. No continue-on-error or success substitution is used. Failed builds/pipelines or harness exits fail the job even after artifact upload. Missing artifacts are an upload error.

After committing/pushing the intended files yourself, inspect the **Lab 12 npm package integration** Actions run on testing-branch, or select it and use Run workflow. A first manual dispatch may require the workflow to be discoverable on the repository's default branch; the testing-branch push trigger provides initial validation without merging into main. Download the evidence artifact and check results.json, cleanup.json and both scenario reports. Hosted Ubuntu validation, browser native compatibility, /proc-based cleanup and artifact delivery are **pending until that actual Actions run succeeds**.

Workflow task local checks passed: actionlint 1.7.11 (ShellCheck unavailable), YAML parsing, all six embedded Bash scripts, cleanup JavaScript syntax, harness Node syntax and git diff --check. The local build and unchanged Lab 12 harness passed again: clean score 100/exit 0, defect score 96/expected exit 2, complete coverage and reports, harness exit 0, temporary consumer removed and source unchanged. Logs are test-reports/lab12-workflow-local-build.log and lab12-workflow-local-harness.log. Ubuntu-only session/process cleanup cannot be executed on this Windows host. The existing 282-test source-suite baseline is unchanged; this workflow-only task reran the package integration rather than the full source suite.

## Chrome launch investigation — commit 264b6f4

GitHub run [#3](https://github.com/zeel2306/-QA-Check-CLI/actions/runs/38780297851) failed in the external-consumer step. The supplied report identifies a Chrome startup timeout, before Lighthouse completed any route: 7/8 coverage, provisional score 100, scanner exit 2. This is incomplete evidence, not a valid clean result. The scanner's Chrome launch deadline is 15 seconds (`src/checks/lighthouse.ts`); the per-route audit timeout is separate. The underlying launcher's default connection polling can run for about 25 seconds; the scanner cleans up late successful launches. Increasing route deadlines would not address this failure.

Public Actions metadata confirms native dependency installation, artifact upload and workflow cleanup succeeded. Runs #1 and #2 passed; the production code, dependencies, Lab 12 harness and Lab 12 workflow are identical between the successful e88727a and failing 264b6f4 commits. This supports intermittent environment behavior rather than a Lab 13 production regression. Raw log download returned HTTP 403 without authenticated GitHub access; the original executable, Chrome stderr, resource usage and process state could not be recovered here. Resource contention and a transient browser startup failure remain possible; neither is proven. Native installation success and passing Playwright checks do not prove Lighthouse's independently selected browser had the same runtime environment.

Verified configuration defect: Lab 12 installed consumer Playwright Chromium but never selected it for chrome-launcher. Lab 11 explicitly exports CHROME_PATH; Lab 13 also previously relied on independent discovery, so its passing matrix does not establish the browser chosen by failed Lab 12. All labs use the same production Lighthouse launch flags and deadline. Local diagnostics confirmed that automatic discovery selected system Google Chrome while the consumer had a different Chromium installation.

The harness now resolves Chromium through the external consumer's installed Playwright, verifies the executable exists, overrides CHROME_PATH only for its child commands, and asserts chrome-launcher selects that exact executable. A headless CDP preflight imports the *installed package's* Chrome lifecycle helper under the existing isolation loader, records browser/protocol version and startup duration, and kills its owned browser/profile before scans. Connection polling is bounded below the scanner's existing 15-second startup allowance; it is not an audit retry. Version comes from CDP because a bare --version process is unsuitable on Windows. There are no audit retries, skipped scanners, relaxed gates or increased production timeouts. Full Lighthouse execution remains mandatory. Scores 100/96 and PDF signatures are now explicit assertions alongside the existing complete-coverage, FULL-confidence, report and exit-code checks.

New evidence includes browser-environment.json (previous selection, installed executable, memory/load), browser-probe.log (verbose launch, CDP version and cleanup), per-command invocation JSON and failure results.json. The Ubuntu workflow also records memory/disk/process snapshots before execution and memory/process snapshots afterward, without exposing process arguments. Existing session cleanup, private-directory ownership checks, artifact upload and original harness exit propagation remain intact. No source CLI, global QA executable or source-module fallback is introduced; browser imports and the lifecycle helper come from the installed consumer. Root dependency versions and production scanner code are unchanged.

For hosted validation, push the reviewed changes yourself to testing-branch and inspect the next Lab 12 run, or dispatch **Lab 12 npm package integration** against testing-branch. Require browser-probe exit 0 with its owned Chrome stopped; consumer-selected CHROME_PATH in both scan invocation files; clean score 100/exit 0 and defect score 96/exit 2; Lighthouse complete, 8/8 coverage and FULL confidence; all four report formats; comparison assertions; results.json passed true and cleanup.json success. A preflight or full audit failure must still fail CI. Repeat the workflow if necessary to evaluate intermittency, preserving each real failure rather than retrying inside the harness. Ubuntu confirmation of this mitigation remains pending until a new run passes; a Windows pass cannot establish the exact cause of the earlier hosted timeout.

Final Windows Node 22.14.0 validation: build PASS; source suite 282 passed, 0 failed, 0 skipped; Lab 11 clean/regression/recovery 100/94/100 with exits 0/2/0; Lab 13 clean/defect/recovery 100/96/100 with exits 0/2/0; corrected Lab 12 clean/defect 100/96 with exits 0/2 and harness exit 0. Lab 12's installed Chromium CDP startup took 1,315 ms and its owned probe Chrome stopped. Both full scans retained 100% coverage, FULL confidence and all report formats, and consumer cleanup/source hash checks passed. The tarball remained 156 files / 148,832 bytes. The initial Windows-only bare-version diagnostic failure is preserved separately under test-reports/lab12-investigation/initial-version-probe; it was corrected before the final successful run, not accepted or retried inside the harness. Final exits and logs are under test-reports/lab12-investigation. Actionlint, YAML parsing, six Bash script syntax checks, harness Node syntax and git diff --check passed. Existing workflows other than Lab 12, production code and dependency manifests remain unchanged.

## Dependency audit review — 2026-10-15 (historical)

Both `npm audit --json` and `npm audit --omit=dev --json` exited 1 and reported **32 affected package entries: 19 moderate, 13 high, 0 critical**. The production-only result contains the same affected package names: **zero development-only findings**. Transitive parents are counted too, so this is not 32 independent exploitable bugs. Production classification means inclusion in the production dependency graph; exploit reachability in QA Check was not demonstrated.

Actionable groups:

- Direct fast-glob → micromatch → braces: high-severity stack exhaustion from deeply nested patterns. npm reports no available fix for this chain. Review whether untrusted patterns can reach scanning; plan a reviewed upstream fix/replacement with scanner regression testing. [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- Direct Lighthouse → Puppeteer/browser management → extract-zip, proxy/PAC/FTP/IP-address dependencies: archive symlink arbitrary writes, resource exhaustion and address-classification bypass findings. Review which downloader/proxy paths the CLI actually invokes. npm proposes Lighthouse 13.5.0 for many parent findings, a major change outside the current 12.x range; evaluate it separately with full Lighthouse/Lab 11/Lab 12 validation, not an automatic force fix. [Archive advisory](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3).
- Lighthouse → Sentry/OpenTelemetry: baggage memory exhaustion and database-username disclosure advisories. Review enabled telemetry/instrumentation paths and upstream compatible fixes. [Baggage advisory](https://github.com/advisories/GHSA-8988-4f7v-96qf).
- npm also lists compatible fixes for some nodes (including brace-expansion and ip-address). Those require reviewed lockfile updates and tests; their presence does not resolve chains where no fix is reported.

Raw local evidence: test-reports/lab12-audit-all.json, lab12-audit-production.json, lab12-audit-summary.json and lab12-audit-paths.json. These audit results describe the source lockfile graph, not a separately audited fresh consumer's independently resolved dependency graph. No audit fix, dependency upgrade, package.json or lockfile change was made. The workflow does not silently waive or introduce a new vulnerability gate; release security remediation remains a separate blocker.
