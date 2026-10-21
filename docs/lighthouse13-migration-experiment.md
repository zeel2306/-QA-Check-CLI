# Lighthouse 13.5 migration experiment

This is the completed Windows experiment record. Subsequent approved workflow preparation and current cross-platform status are documented in `lighthouse13-cross-platform-validation.md`; statements below about unchanged workflows refer to the earlier experiment stage.

Branch: `codex/lighthouse-13-5-experiment`, based on `testing-branch` at c5f48fe. No release, commit, push or workflow changes are part of this experiment.

## Contract and implementation

- Lighthouse dependency: `^12.8.2` → `^13.5.0` (locked 13.5.0). Node engine: `>=20` → `>=22.19`. The package version remains 1.3.0 for local packing only; adoption requires a separately reviewed breaking-release/version decision.
- The executable checks the installed package engine before loading the CLI. Direct `dist/index.js` execution also checks the engine. Node 20 and Node 22 before 22.19 fail with an actionable compatibility error; normal npm engine warnings become installation failures with `--engine-strict`.
- Worker isolation, Lighthouse invocation, Chrome executable selection/CDP readiness, time budgets, owned-process cleanup, and incomplete-audit semantics are preserved.
- Lighthouse 13 removed `server-response-time`. QA Check's existing `metrics.TTFB` historically meant server response duration, not navigation-to-first-byte. It now reads `document-latency-insight.details.debugData.serverResponseTime` in milliseconds; legacy extraction remains supported. Insight savings must never substitute for a timing. `navigationTTFB` is an additive field from `metrics.details.items[0].timeToFirstByte`. Per-page engine version and metric provenance are additive JSON fields. Missing metrics remain unavailable.
- No quality/security thresholds, scanner weights, regression logic or reporter templates are relaxed. Lighthouse category scores remain supplied by Lighthouse, whose accessibility audit weights changed in version 13. Scores from different Lighthouse versions need an intentional new baseline; raw reports are not byte-identical across engine versions. The new server response timing is rounded to integer milliseconds upstream; the previous audit exposed fractional milliseconds. QA Check's independent runtime Performance scanner and its timing thresholds are unchanged.

Resolved dependencies relevant to the migration:

| Dependency | Source before | Source after |
| --- | --- | --- |
| lighthouse | 12.8.2 | 13.5.0 |
| puppeteer-core | 24.43.1 | 25.15.0 |
| @puppeteer/browsers | 2.13.2 | 3.2.5 |
| @sentry/node | 9.47.1 | 10.76.2 |
| @opentelemetry/core | 1.30.1 | 2.12.0 |
| extract-zip | 2.0.1 | removed |
| basic-ftp | 5.3.1 | removed |
| proxy-agent / pac-proxy-agent / get-uri | 6.5.0 / 7.2.0 / 6.0.5 | removed |
| axe-core | 4.12.1 | 4.14.0 |

The existing direct axe-core range remains `^4.12.1`; npm hoisted 4.14.0 while satisfying Lighthouse's newer axe requirement. The earlier packed consumer already used axe-core 4.14.0. Other direct dependency ranges remain unchanged. Source Playwright remains locked at 1.61.1; the independently resolved consumer uses 1.64.1. Both source and consumer resolve Lighthouse 13.5.0. No overrides, suppressions, forced audit fixes or policy exemptions were introduced.

## Validation evidence

Results and full logs are retained under ignored `test-reports/lighthouse13-experiment/`. The controlled comparison uses identical HTML (including a 900ms delayed route), Node 22.19.0 and the same Playwright Chromium executable. Both Lighthouse 12.8.2 and 13.5.0 initially returned performance 100/99 for normal/delayed pages, accessibility 100, best practices 100, SEO 91. This comparison fixture is diagnostic, not a Lab clean baseline. Lab assertions remain 100 for clean/recovery and require full coverage/confidence.

Final local results, 2026-10-21/22 (Windows x64):

| Validation | Node 22.19.0 | Node 24.22.0 |
| --- | --- | --- |
| Build / full source tests | PASS; 296 passed, 0 failed, 0 skipped | PASS; 296 passed, 0 failed, 0 skipped |
| Security-policy tests | 2 passed, 0 failed | 2 passed, 0 failed |
| Lab 11 | PASS: 100/94/100; exits 0/2/0 | Not rerun on this runtime |
| Lab 12 | PASS: 100/96; exits 0/2 | PASS: 100/96; exits 0/2 |
| Lab 13 (Windows) | PASS: 100/96/100; exits 0/2/0 | Not rerun on this runtime |
| Lab 14 | Functional PASS, security PASS, READY for this runtime; harness exit 0 | Functional PASS, security PASS, READY for this runtime; harness exit 0 |
| Explicit packed-runtime test | Strict-engine install, help/version PASS | Strict-engine install, help/version PASS |

All scenario scores above are actual scanner output. Labs 11, 13 and 14 ran clean, defect and recovery; Lab 12's existing contract contains clean and defect. All scenario reports have 100% coverage and FULL confidence. Deliberate defects retain failing quality gates and scanner exit 2; regression failures are detected by the configured gates/comparison commands. Recovery and unchanged comparisons pass. HTML, JSON, Markdown and PDF reports were generated and checked by the existing harnesses. Temporary consumers were outside the repository; source-integrity and owned-process cleanup checks passed. The tested package contained 159 files (150,339 bytes compressed before the final README wording correction). The final locally packed artifact after that documentation-only correction is 150,350 bytes compressed / 636,824 bytes unpacked, still 159 files; its manifest is retained in `test-reports/lighthouse13-experiment/final-package/manifest.json`. Runtime code and dependencies are unchanged from the integration-tested package.

The extra runtime test installs the real tarball with Node 20.20.2 as a negative case: normal npm installation warns about engine incompatibility; version/help/scan all exit 1 with the clear Node >=22.19 message before CLI initialization, without reports. `--engine-strict` installation rejects with EBADENGINE. Source executable rejection is also tested. Normal npm engine warnings alone do not force installation failure; the runtime guard is therefore required.

### Security results

| Production graph | Before high / moderate / critical | After high / moderate / critical |
| --- | --- | --- |
| Source | 8 / 19 / 0 | 0 / 0 / 0 |
| Actual external packed consumer | 8 / 20 / 0 | 0 / 0 / 0 |

The old source lockfile was freshly audited again and still returned 27 findings. The consumer before-count is the previously verified actual packed-consumer audit, retained under `test-reports/release-security-current/before-consumer.json`; it was not reconstructed from Lighthouse's isolated audit. Both post-migration graphs were freshly audited in Lab 14 under Node 22.19 and Node 24, with valid audit inventories, audit exit 0 and dependency-tree exit 0. There are no remaining moderate paths in either production graph. The old browser-management high findings disappear through removal/replacement of the vulnerable dependency chains, and Sentry/OpenTelemetry upgrades remove the moderate findings. The source `npm ci` also reported zero vulnerabilities.

Lab 11's separate private fixture installation reported 13 development-tree advisories (10 high, 3 moderate). That fixture's dependencies are not the CLI production graph and are excluded from the tarball; they were not modified in this migration. They remain a separate fixture-maintenance risk, not an exemption added to Lab 14.

### Investigated validation failures

1. The first full Node 24 source run had 295 passes and one failure in the existing 30ms total-budget unit test. That test uses a mocked runtime and does not execute Lighthouse. A controlled diagnostic produced PARTIAL without startup delay and TIMEOUT with zero audited routes after a 40ms startup delay: the original assertion depended on scheduling before its first route. The test now advances its monotonic clock and timer only after the second route starts. All original assertions remain; completed/attempted counts and route timeout status are additionally asserted. Production timeouts are unchanged. Both final full suites pass 296/296.
2. The first additional runtime harness timed out during Node 24 npm installation before executing the CLI. Lab 12 and Lab 14 had independently passed Node 24 installs/scans. The harness now preserves command duration, exit/signal, stdout/stderr and spawn errors, and uses npm's normal `--prefer-offline` cache preference. Missing dependencies still download; security audits remain fresh and unchanged. The explicit retry passed all three runtime contracts. Original failed-run evidence is retained rather than overwritten as success.

Raw evidence: `test-reports/lighthouse13-experiment/validation/` contains archived lab reports/logs; `controlled-comparison.json` and `before/after/*-lhr.json` contain the real same-browser comparison; `final-source-retests.json` and `final-*-node*.log` contain final suite results. `test-reports/lighthouse13-runtime/` contains package/runtime commands and cleanup evidence. The initial `validation-results.json` intentionally retains the two failed first attempts; `final-summary.json` combines them with the successful retests and checks the archived reports, completed Lighthouse pages, PDF headers, audit inventories and cleanup evidence.

### Recommendation

**NO-GO for adopting/releasing yet; the Windows experiment passes.** No production dependency security blocker remains in either audited graph. No functional scanner/report regression was observed in the Windows integrations. Node 20 and pre-22.19 Node 22 rejection is an intentional compatibility break approved for this experiment, not preserved support. Linux and macOS browser execution remains unverified for this migration. Approve the CI matrix migration, then run all platforms before adopting. A safe proposed matrix is Node `22.19.0`, latest `22`, and `24` on Windows/Ubuntu/macOS, replacing the unsupported Node 20 leg while covering the exact minimum. A breaking-release version decision and fresh score baselines are also required before any publication. This experiment does not publish or alter the existing npm release.

Local platform is Windows only. Linux/macOS execution requires hosted or other actual runners; existing workflow files remain unchanged. The existing Lab 14 Node 20 matrix is incompatible with this experimental minimum and requires an explicitly approved workflow migration before adoption. No Linux/macOS success is inferred from Windows results.

| Operating system | Node 22.19+ | Node 24 |
| --- | --- | --- |
| Windows x64 | Verified locally as detailed above | Verified locally as detailed above |
| Ubuntu | Pending real runner execution | Pending real runner execution |
| macOS | Pending real runner execution | Pending real runner execution |

## Exact changed files

- `package.json`, `package-lock.json`: dependency graph and engine contract.
- `bin/qa-check.js`, `src/index.ts`, `src/core/nodeVersion.ts`: early installed-metadata runtime check.
- `src/core/doctor.ts`: consistent engine diagnostics.
- `src/checks/lighthouse.ts`, `src/core/lighthouseMetrics.ts`: Lighthouse 13 metric adaptation and engine/provenance fields.
- `src/tests/lighthouseMetrics.test.ts`, `src/tests/nodeVersion.test.ts`: migration/boundary coverage.
- `src/tests/lighthouseTimeouts.test.ts`: deterministic existing total-budget test, with stronger assertions.
- `tests/integration/lab14-release.mjs`: experimental minimum-engine assertion; security policy unchanged.
- `tests/integration/lighthouse13-runtime.mjs`: isolated real-package runtime compatibility tests and diagnostics.
- `README.md`, `docs/lighthouse13-migration-experiment.md`: engine documentation and experiment results.

The pre-existing untracked `docs/lab13-c5f48fe-ci-investigation.md` and `docs/release-security-readiness-investigation.md` were preserved. No workflow or security-policy files changed. No commit, push, merge, tag or publish was performed.

## Reproduction (PowerShell)

Use Node 22.19.0 or newer supported Node 22/24 on PATH:

The machine's default Node 22.14 was not replaced and is below the experimental minimum. For the currently installed isolated test runtime, set PowerShell PATH first:

```powershell
$node22 = 'C:\Users\Dell\AppData\Local\npm-cache\_npx\992a19d7d9bf36d4\node_modules\node\bin\node.exe'
$env:Path = (Split-Path -Parent $node22) + ';' + $env:Path
$env:npm_execpath = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
node --version  # v22.19.0
```

```powershell
npm ci
npm run build
npm test
node --test tests/integration/release-security.test.mjs
node tests/integration/lab11-cicd.mjs
node tests/integration/lab12-package.mjs
node tests/integration/lab13-platform.mjs
node tests/integration/lab14-release.mjs
node tests/integration/lighthouse13-runtime.mjs 'C:\path\node22\node.exe' 'C:\path\node24\node.exe' 'C:\path\node20\node.exe'
npm audit --omit=dev --json
git diff --check
```

The runtime harness packs the real CLI, installs it into external consumers, validates Node 22/24 using strict engine installation, and verifies clear Node 20 rejection before scanner/browser initialization. It retains package/install/command evidence and deletes its owned temporary directories. Labs 12–14 independently validate real external packages and all four report formats. Lab 14 remains the authority for source AND packed-consumer release security.
