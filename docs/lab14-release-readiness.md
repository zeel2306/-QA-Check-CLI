# Lab 14 — release readiness and security gate

Recommendation: **BLOCKED by security findings; functional gate PASS**. This lab validates a controlled release candidate; it never publishes. Work is on testing-branch, based on c1a0436. The version-command fix changes only the CLI entry point's early handling of --version. Dependency manifests, scanner behavior and existing workflows remain unchanged.

## Scope and reproducibility

`node tests/integration/lab14-release.mjs` builds and dry-packs the current checkout, checks the runtime-file allowlist and common secret markers, creates the actual npm tarball, verifies its size/inventory/SHA-512 integrity and installs it in an external temporary consumer. It derives its lifecycle, path tests, fixtures and strict assertions from Lab 13 and reuses the portable npm resolver and shared installed-consumer Chromium/CDP setup. No global QA executable or source module is used. The installed npm shim is invoked by its exact local path, and Node CLI calls use the absolute installed entry and module-isolation loader. Imported files outside the consumer are rejected; browser binaries are resolved from the consumer's Playwright installation.

Unlike no-save smoke installations, Lab 14 saves the tarball dependency and creates a real consumer package-lock.json, so npm audit examines the installed QA dependency graph. This consumer lock is retained as evidence before cleanup. The source lockfile and independently resolved consumer lockfile are audited separately; the package's runtime dependency ranges may resolve newer compatible transitive versions than source npm ci. No root dependencies are upgraded. Every result records platform, architecture, Node version, package metadata and compatibility limitations. Browser downloads are private to the owned temporary directory (including a spaced executable path), so local runs also remove those installations after validation instead of leaving a new global Playwright cache.

Metadata checks require package/lock/root-lock/tarball/installed name and version consistency, a semantic version, unchanged main/bin/engines/dependencies/license/type, required runtime files, README, npm shim and shebang. The current package has no exports map or release/publish scripts; main points at dist/index.js and bin/qa-check.js imports it. There is no package prepack/prepare build hook, so the harness explicitly builds before packing. Common secret-pattern checks are not a comprehensive secret review. The declared MIT metadata is present; the package currently has no separate LICENSE file, which deserves maintainer review before distribution.

## Functional contract and command coverage

Help (--help/help/-h), exact installed shim help, doctor, init, fix --dry-run, API/test/E2E/flow empty-configuration branches, full scans and compare are executed using current source syntax. The scans exercise --ci, --profile ci, --fail-on error, --url, --output, --pdf, --markdown, --no-history, --baseline and --no-baseline, with spaced/nested paths and different working directories. Other flag combinations and configured API/E2E journeys are not exhaustively tested here; Lab 11 and the source suite supply additional coverage.

Required clean/defect/recovery scores remain 100/96/100, exits 0/2/0, coverage 100% and confidence FULL. All four report formats must be nonempty and PDFs must have a real PDF signature. Incomplete scanners cannot pass. Defect runs must find /ghost and /missing.png and fail regression; recovery must fix issues with no new issues. Comparison commands must report regression (exit 1) and unchanged reports (exit 0). A scanner's expected exit 2 is distinct from the harness exit.

`qa-check --version` now reads the package.json located relative to src/index.ts or its installed dist/index.js, prints its version and returns before project path/configuration, scanner or browser initialization. It does not use the working directory's package metadata or a compiled version constant. Repository bin/main entry tests run from an external directory with conflicting package metadata and malformed QA config. Labs 12–14 also run the installed command from a different cwd, temporarily change the installed metadata version and restore its exact contents, proving dynamic lookup without changing the packed artifact or source metadata. Test loaders reject scan-engine/browser imports, and cwd file lists and contents must remain unchanged. No scan reports or browser initialization occur during these version checks. The documented command is now verified without weakening the release contract or security policy.

## Explicit release security policy: lab14-v1

- Run npm audit --omit=dev --json on BOTH source and consumer lockfiles. Store full advisories, severity counts, affected ranges, direct/transitive markers, nodes/effects/via chains and fixAvailable data. Store npm ls --all --omit=dev --json for resolved versions and dependency paths.
- Any high or critical production finding in either graph blocks release. There are no allowlists or reachability-based waivers.
- Moderate, low and informational findings remain visible for review; they do not individually block this policy. They are not declared safe or ignored.
- Missing/malformed/inconsistent audit evidence, registry errors, or unexpected npm exit codes block release. Policy parsing is unit tested, including fail-closed cases. Audit exit 1 means findings only when valid evidence supports it; it is never converted blindly to success.
- No audit fix, --force, dependency overrides or automatic upgrades are run. Findings do not prove exploit reachability. This gate is dependency advisory screening, not penetration testing, provenance/signature verification or a complete security assessment.

Source audit on 2026-10-17: **30 affected package entries, 19 moderate, 11 high, 0 critical**. Parent meta-vulnerabilities contribute to counts. Important paths include fast-glob → micromatch → braces (nested-pattern stack exhaustion; audit reports no fix), and Lighthouse → Puppeteer/browser-management/proxy chains → extract-zip/basic-ftp (archive symlink writes and resource exhaustion). Lighthouse also introduces Sentry/OpenTelemetry moderate findings. Some nodes have compatible fixes reported; many parent findings propose Lighthouse 13.5.0, a major upgrade requiring separate API/scanner validation. Preserve the full inventory rather than treating a parent upgrade suggestion as an approved or complete remediation.

Runtime exposure depends on actual inputs and invoked APIs: QA uses fast-glob for source discovery and launches Lighthouse with its own browser; inclusion of proxy/download/telemetry modules does not prove those vulnerable paths execute. Review trusted versus untrusted patterns, archive sources, proxy configuration and telemetry separately. Absence of demonstrated reachability does not waive the high-severity gate. See docs/dependency-security-investigation.md and the current audit evidence for further investigation.

## Results and CI

Local validation completed on Windows x64 / Node 22.14.0:

| Check | Result |
| --- | --- |
| Build | PASS |
| Source suite | 284 passed, 0 failed, 0 skipped |
| Release security policy tests | 2 passed, 0 failed |
| Lab 11 clean/regression/recovery | PASS: scores 100/94/100; exits 0/2/0 |
| Lab 12 clean/defect | PASS: scores 100/96; exits 0/2 |
| Lab 13 clean/defect/recovery | PASS: scores 100/96/100; exits 0/2/0 |
| Lab 14 clean/defect/recovery | PASS: scores 100/96/100; exits 0/2/0; 100% coverage; FULL confidence |
| Installed npm shim, help/doctor and other command branches | PASS |
| Documented --version | PASS: prints 1.3.0, exits 0, no scan/browser initialization |
| Source production security | BLOCKED: 30 entries, 11 high / 19 moderate |
| Consumer production security | BLOCKED: 31 entries, 12 high / 19 moderate |
| Final release gate | Functional PASS; BLOCKED by security only, exit 3 |
| Cleanup / source hashes | PASS; consumer, tarball and private browser binaries removed |
| Workflow/static checks | Actionlint, YAML, all eight PowerShell scripts, Node syntax and whitespace checks PASS |

The consumer's extra high entry is qa-check-cli itself, classified as a meta-vulnerability through fast-glob and Lighthouse; the underlying affected package-name sets otherwise match. It is not an additional independently demonstrated exploit. Both complete inventories, affected ranges, fix proposals and resolved dependency trees are retained. All three scenarios generated HTML/JSON/Markdown/PDF reports. Private Chromium CDP startup took 1,542 ms; its executable path contained spaces, and the owned probe browser stopped. The updated tarball is qa-check-cli@1.3.0, 156 files, 148,877 compressed bytes / 632,947 unpacked bytes. Results are in test-reports/lab14-release/win32/results.json; the complete version-fix build/source-suite/Labs 11–14 exit evidence is in test-reports/version-fix/exits.json, with individual command logs alongside it. All version checks and package restoration passed; cleanup removed temporary consumers/tarballs/browsers and source hashes were unchanged. The gate completed its functional scenarios, then deliberately rejected release for security findings only.

Before release: remediate the blocking high-severity dependency chains with compatible fixes or reviewed replacements/upgrades; review remaining moderate risks and package license notice/build procedure; rerun the complete gate and all nine hosted matrix legs. Do not waive current findings or accept provisional scanner evidence to obtain READY. Hosted validation of this version fix/new workflow and Node 20/24 compatibility is pending; no controlled release is authorized by these local results.

Exit codes: **0** = functional and security gates pass for this runtime; **1** = functional/metadata/cleanup failure (security results remain separately visible); **3** = security-only failure or incomplete security evidence. Both gates are always represented in results.json. Functional failure takes exit-code precedence if both fail. A per-platform READY result alone does not approve release: all required matrix legs, remaining reviews and maintainer release authorization are still required.

The new lab14-release.yml runs on testing-branch pushes, PRs to main and manual dispatch. It validates Windows, Ubuntu and macOS with Node 20, 22 and 24, using read-only contents permission, fail-fast disabled and at most three concurrent matrix jobs. Node 20 tests the declared minimum major; earliest Node 20 minors, other majors allowed by >=20, every shell/architecture and network/UNC/extended-length paths are not certified. Only Ubuntu installs Linux browser libraries. Each consumer installs its own Chromium. Hosted results are pending until the matrix actually runs.

The workflow preserves genuine nonzero exits, writes separate functional/source-security/consumer-security summaries, always cleans its private temporary storage and owned processes, then uploads OS/Node-specific artifacts. The harness bounds commands, handles cancellation, stops owned children/server, checks temp-path ownership, removes consumers/tarballs and verifies source hashes. Browser/profile cleanup uses existing tested helpers. Abrupt runner loss/SIGKILL can prevent post-processing; the runner VM is disposable. Existing workflows are untouched.

Evidence under test-reports/lab14-release/<platform>: environment metadata, invocation/log files, package inventory and integrity, consumer lockfile, audit-source/consumer JSON and trees, Chromium/CDP diagnostics, clean/defect/recovery HTML/JSON/Markdown/PDF reports, score diagnostics, cleanup.json and final results.json. Source validation logs live under test-reports/lab14-validation. Workflow setup/build/native dependency/harness logs are under test-reports/lab14-workflow. Artifacts are retained 14 days; store reviewed evidence elsewhere before it expires.

## Reproduce in PowerShell (Node 22 installed)

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
git branch --show-current
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Source tests failed' }
node --test tests/integration/release-security.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Security policy tests failed' }
node tests/integration/lab11-cicd.mjs
if ($LASTEXITCODE -ne 0) { throw 'Lab 11 failed' }
node tests/integration/lab14-release.mjs
$releaseExit = $LASTEXITCODE
Get-Content test-reports/lab14-release/win32/results.json
Write-Host "Release gate exit: $releaseExit"
git diff --check
git status --short
```

Inspect nonzero results; do not replace the gate's exit with a success assertion. On Ubuntu install native Chromium dependencies using the repository Playwright before running the harness. Review/push the new workflow yourself only when desired; no commit, push, merge or publication is part of this task.
