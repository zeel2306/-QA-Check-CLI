# Lab 15 — Dependency security remediation investigation

Date: 2026-10-21. Branch: testing-branch. Local runtime: Windows x64 / Node 22.14.0.

## Decision

Release remains **BLOCKED** under the unchanged lab14-v1 policy. No high/critical finding is waived based on reachability. Missing security evidence also blocks release.

The compatible glob replacement described below has been applied after isolated API comparisons and candidate auditing. The remaining patch/minor paths do not resolve the Lighthouse advisories; the recommended Lighthouse upgrade breaks Node 20 compatibility. This document presents those breaking decisions before implementation.

package.json, package-lock.json and internal glob imports changed. Scanner scoring, regression detection, Lighthouse, supported Node engines and workflows remain unchanged. No overrides, suppressions, force fixes, commits, pushes, merges or publication were performed.

## Counts and evidence

Counts describe vulnerable package entries, including propagated parents, not independent exploits.

| Scope | Before | After | Decision |
|---|---|---|---|
| Source production | 30: 11 high, 19 moderate, 0 critical | 27: 8 high, 19 moderate, 0 critical | BLOCKED |
| Packed external consumer | 31: 12 high, 19 moderate, 0 critical | 28: 8 high, 20 moderate, 0 critical | BLOCKED |

The baseline consumer's extra high entry is qa-check-cli itself, inherited through fast-glob and Lighthouse. In the final audit npm classifies that extra parent entry as **moderate**, inherited only through Lighthouse; all eight underlying high entries remain blocking. Counts are recorded exactly as returned, without normalizing severity to an expected value. This is not a new independent advisory or a claim that Lighthouse's high findings were fixed. The consumer resolves Sentry 9.47.2 while the source retains 9.47.1; all other underlying vulnerable package versions match. See consumer-version-differences.json. Existing package ranges allow independent consumer resolution; no shrinkwrap was added.

Fresh evidence is under test-reports/lab15-security: before-production.json, after-production.json, after-all.json, after-consumer.json, after-consumer-lock.json, source-tree.json, after-source-tree.json, inventory.json, candidates.json, alternatives.json, compatible-fix-dry-run.json, lock-delta.json, replacement-npm-ci.log, replacement-source-exits.json, replacement-integration-exits.json, final-lab14-results.json and final-cleanup.json. inventory.json retains installed node paths, shortest inspected dependency chain, advisory affected ranges, URLs and npm fix proposals. The all-dependency final audit also reports 27 entries (8 high, 19 moderate), with no additional development-only findings. Existing docs/dependency-security-investigation.md covers the earlier 32 → 30 remediation, which is already present in this baseline; do not count it again.

npm audit fix --dry-run --ignore-scripts --json was used only to inspect a proposal. It returned findings and proposed four Sentry 9.47.1 → 9.47.2 package updates plus platform-optional packages. The dry run did not change the manifest/lock. Sentry 9.47.2 still requires @opentelemetry/core ^1.30.1 and pins affected instrumentations. It is not a demonstrated fix for these findings. npm's fixAvailable=true on inherited entries is not proof that a compatible complete remediation exists.

## Applied compatible remediation

Replaced direct fast-glob ^3.3.3 with tinyglobby ^0.2.17. The resolved replacement is tinyglobby 0.2.17 with fdir 6.5.0 and picomatch 4.0.7. All three declare Node >=12, preserving the current Node >=20 contract. No surviving package resolution changed version. lock-delta.json records all 18 removed entries and the three added entries. In particular fast-glob, micromatch and braces are physically absent from the production lock tree; this is removal, not audit suppression.

All ten production importer files now use src/utils/sourceGlob.ts. The helper preserves the options used by the CLI, returns unique file paths and explicitly disables tinyglobby's automatic literal-directory expansion. Build snapshots still disable symbolic-link following. Because fdir normally suppresses filesystem callback errors, the adapter records non-ENOENT readdir/realpath/stat errors and rejects the discovery instead of accepting partial file evidence. Missing/disappearing paths remain tolerated as before. The existing scanner patterns, ignore lists, route logic and score formulas were not changed.

Before replacement, ten isolated comparisons against the old engine matched on Windows, covering HTML, JSX, Next dynamic route filenames, Laravel, SEO, lint, dotfile build snapshots, directory-junction traversal, duplicate patterns and literal directories. Saved glob-parity.json records the expected and actual file sets. Eight new source tests assert these contracts without retaining the vulnerable library as a test dependency. They also cover spaced Unicode working directories, permission failures through a filesystem adapter and missing directories. The candidate's isolated dependency audit returned zero findings; that alone is not a security proof, so the complete CLI source and external-consumer audits are still required.

## Production reachability

These are code-path observations, not exploitation tests or assertions that vulnerable dependencies are safe. No malicious pattern, archive, proxy payload or telemetry input was executed.

- **G — baseline glob path, now removed:** fast-glob was actively called by source discovery, build snapshots, lint and static scanners. Inspected callers supply fixed source-code patterns and ignore patterns; user project paths and filenames are not supplied as arbitrary brace expressions. No entry feeding attacker-controlled deeply nested brace syntax was found. The three affected package entries have now been removed through the replacement, not waived.
- **B — browser-management path:** Lighthouse uses puppeteer.connect to attach to Chrome launched by the CLI. @puppeteer/browsers includes proxy/download/extraction code; the normal QA path does not call its browser installation API. extract-zip is dynamically imported by its archive extraction helper. basic-ftp is reached through get-uri/PAC/proxy support. Module inclusion/import does not establish invocation of the vulnerable operation. Environment/proxy configurations and future code paths require review.
- **T — telemetry path:** Lighthouse core/lib/sentry.js returns before importing @sentry/node unless enableErrorReporting is enabled. The QA Lighthouse options do not enable it. Database attribute disclosures require active instrumentation/export; QA does not configure those. No current normal-path exposure was demonstrated, but all moderate findings remain recorded.
- **L — Lighthouse parent:** performance scanning is active; its high classification is propagated from browser management and its moderate subtree from telemetry. It is not a separate demonstrated exploit.

## Complete baseline production inventory

The chain column gives one resolved production path, not every duplicate path. G entries are removed by the applied remediation; all other entries remain. Full nodes/via/effects remain in audit JSON. An inherited package has no independently established patched version; its affected child cohort must be fixed.

| Package | Severity | Installed version(s) | Production chain | Affected range / remediation | Reachability |
|---|---|---|---|---|---|
| @opentelemetry/core | moderate | 1.30.1 | lighthouse → @sentry/node → @opentelemetry/core | @opentelemetry/core: affected <2.8.0 | T |
| @opentelemetry/instrumentation-amqplib | moderate | 0.46.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-amqplib | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-connect | moderate | 0.43.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-connect | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-express | moderate | 0.47.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-express | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-fs | moderate | 0.19.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-fs | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-hapi | moderate | 0.45.2 | lighthouse → @sentry/node → @opentelemetry/instrumentation-hapi | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-http | moderate | 0.57.2 | lighthouse → @sentry/node → @opentelemetry/instrumentation-http | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-knex | moderate | 0.44.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-knex | @opentelemetry/instrumentation-knex: affected <0.65.0 | T |
| @opentelemetry/instrumentation-koa | moderate | 0.47.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-koa | Inherited via @opentelemetry/core | T |
| @opentelemetry/instrumentation-mongoose | moderate | 0.46.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-mongoose | @opentelemetry/instrumentation-mongoose: affected <0.67.0 | T |
| @opentelemetry/instrumentation-mysql | moderate | 0.45.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-mysql | @opentelemetry/instrumentation-mysql: affected <0.67.0 | T |
| @opentelemetry/instrumentation-mysql2 | moderate | 0.45.2 | lighthouse → @sentry/node → @opentelemetry/instrumentation-mysql2 | @opentelemetry/instrumentation-mysql2: affected <0.67.0 | T |
| @opentelemetry/instrumentation-pg | moderate | 0.51.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-pg | @opentelemetry/instrumentation-pg: affected <0.73.0 | T |
| @opentelemetry/instrumentation-tedious | moderate | 0.18.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-tedious | @opentelemetry/instrumentation-tedious: affected <0.40.0 | T |
| @opentelemetry/instrumentation-undici | moderate | 0.10.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-undici | Inherited via @opentelemetry/core | T |
| @opentelemetry/resources | moderate | 1.30.1 | lighthouse → @sentry/node → @opentelemetry/resources | Inherited via @opentelemetry/core | T |
| @opentelemetry/sdk-trace-base | moderate | 1.30.1 | lighthouse → @sentry/node → @opentelemetry/sdk-trace-base | Inherited via @opentelemetry/core, @opentelemetry/resources | T |
| @opentelemetry/sql-common | moderate | 0.40.1 | lighthouse → @sentry/node → @opentelemetry/instrumentation-mysql2 → @opentelemetry/sql-common | Inherited via @opentelemetry/core | T |
| @puppeteer/browsers | high | 2.13.2 | lighthouse → puppeteer-core → @puppeteer/browsers | Inherited via extract-zip, proxy-agent | B |
| @sentry/node | moderate | 9.47.1 | lighthouse → @sentry/node | Inherited via @opentelemetry/core, @opentelemetry/instrumentation-amqplib, @opentelemetry/instrumentation-connect, @opentelemetry/instrumentation-express, @opentelemetry/instrumentation-fs, @opentelemetry/instrumentation-hapi, @opentelemetry/instrumentation-http, @opentelemetry/instrumentation-knex, @opentelemetry/instrumentation-koa, @opentelemetry/instrumentation-mongoose, @opentelemetry/instrumentation-mysql, @opentelemetry/instrumentation-mysql2, @opentelemetry/instrumentation-pg, @opentelemetry/instrumentation-tedious, @opentelemetry/instrumentation-undici, @opentelemetry/resources, @opentelemetry/sdk-trace-base | T |
| basic-ftp | high | 5.3.1 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri → basic-ftp | basic-ftp: affected <=6.2.0 | B |
| braces | high | 3.0.3 | fast-glob → micromatch → braces | braces: affected <=3.0.3 | G |
| extract-zip | high | 2.0.1 | lighthouse → puppeteer-core → @puppeteer/browsers → extract-zip | extract-zip: affected <=2.0.1; extract-zip: affected <=2.0.1 | B |
| fast-glob | high | 3.3.3 | fast-glob | Inherited via micromatch | G |
| get-uri | high | 6.0.5 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri | Inherited via basic-ftp | B |
| lighthouse | high | 12.8.2 | lighthouse | Inherited via @sentry/node, puppeteer-core | L |
| micromatch | high | 4.0.8 | fast-glob → micromatch | Inherited via braces | G |
| pac-proxy-agent | high | 7.2.0 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent | Inherited via get-uri | B |
| proxy-agent | high | 6.5.0 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent | Inherited via pac-proxy-agent | B |
| puppeteer-core | high | 24.43.1 | lighthouse → puppeteer-core | Inherited via @puppeteer/browsers | B |

## Patched boundaries and safe-upgrade review

| Underlying finding | Patched boundary / candidate | Compatibility decision |
|---|---|---|
| OpenTelemetry core baggage allocation | Advisory affects <2.8.0; 2.8.0 is the minimum unaffected boundary | Sentry 9 requires core ^1.30.1. Forcing core 2 violates the parent range/API; not applied. Latest core 1 is 1.30.1. |
| DB attribute disclosure: knex | Advisory boundary 0.65.0 | Sentry 9 pins 0.44.1; migration required. |
| DB attribute disclosure: mongoose/mysql/mysql2 | Advisory boundary 0.67.0 for these findings | Sentry 9 pins 0.46.1/0.45.1/0.45.2 respectively; migration required. |
| DB attribute disclosure: pg | Advisory boundary 0.73.0 | Sentry 9 pins 0.51.1; migration required. |
| DB attribute disclosure: tedious | Advisory boundary 0.40.0; also verify the resolved core cohort | Sentry 9 pins 0.18.1; no forced replacement. |
| basic-ftp list parser CPU exhaustion | Affected <=6.2.0; latest checked candidate 6.2.3 | Installed 5.3.1. Parent get-uri requires the 5.x cohort. Major override is not a compatible fix. |
| braces nested pattern stack exhaustion | Affected <=3.0.3; no patched release listed | Latest fast-glob 3.3.3 and braces 3.0.3 still retain finding. Replacement investigation below. |
| extract-zip symlink path traversal / arbitrary writes | Affected <=2.0.1; no patched release listed | Latest checked 2.0.1 remains affected. Replacement must occur in the owning downloader chain. |
| Other inherited OpenTelemetry and browser/proxy entries | Fix the underlying advisories and re-audit the complete graph | Updating only a parent version number does not prove removal of the vulnerable paths. |

Registry queries confirm Lighthouse 12.8.2 and Puppeteer 24.43.1 are the latest releases in their current majors. No compatible upgrade from those installed versions was found. The earlier brace-expansion 2.1.7 and ip-address 10.7.4 patches are already installed.

## Lighthouse upgrade: separate compatibility decision required

Lighthouse 13.5.0 requires Node >=22.19. Project engines are >=20, and this machine is Node 22.14.0. All Lighthouse 13.0+ candidates must be checked rather than assuming an older 13 release preserves Node 20; the 13.0 release notes also raise the minimum to 22.19. It was not installed.

An isolated **lock-only** Lighthouse 13.5.0 graph resolved and audited with zero findings (candidates/lighthouse13/result.json). npm emitted EBADENGINE on this Node 22.14.0 machine, confirming the engine incompatibility. No candidate runtime or install lifecycle scripts were executed, and the CLI remains on Lighthouse 12.8.2. This audit measures the isolated candidate graph only; it does not establish scanner compatibility or approve a release.

QA reads lhr.categories performance/accessibility/seo/best-practices scores and numericValue fields for CLS/LCP/FCP/INP plus audits["server-response-time"] for TTFB. The worker also hooks lighthouse-logger, preserves source-map diagnostics, cancels timed-out workers and reports route coverage. Baseline comparison and reports consume these metrics. Lighthouse 13 changes audit/insight outputs, trace-engine TTFB processing and accessibility weights. A version bump without fixture and metric-contract tests could silently remove TTFB or change scoring; preserving successful exits alone is insufficient.

Proposed migration validation: inspect the actual packed 13.x LHR/insight schema, establish a semantically correct TTFB source and units without confusing total document latency with TTFB, preserve missing-evidence behavior, verify category scores and route timeout/cleanup semantics, run slow-server and complete/incomplete route cases, source tests and Labs 11–14 on all supported platforms. New scores require justified upstream behavior analysis, not weaker fixture expectations.

The Lighthouse compatibility decision is presented before any breaking upgrade:
1. Keep Node 20 and investigate an upstream-supported backport or separately maintained compatible dependency cohort. No verified complete Lighthouse solution has been identified; release remains blocked.
2. Deliberately raise the minimum to >=22.19 and migrate Lighthouse with explicit metric/scoring validation. This is breaking and has not been applied or approved.

Splitting dependencies by Node version would leave Node 20 installations vulnerable if they retain Lighthouse 12; that would not satisfy the current release policy.

## Alternatives for packages with no patched release

- **fast-glob replacement:** tinyglobby 0.2.17 was selected after the comparisons described above. glob 13.0.6 was also evaluated; it declares Node 18/20/>=22 and uses minimatch/path-scurry. Its isolated audit also returned zero findings, but it was not selected or installed into production. Hosted Node 20/22/24 platform verification is still required for the applied helper, including symlink/error handling and large trees. Permission-denied directories and every filesystem behavior are not certified by the local fixture cases. Node's native glob is not a universal Node 20 solution.
- **extract-zip replacement:** yauzl 3.4.0 (Node >=12) is a lower-level archive reader, not a safe extraction API drop-in. unzipper 0.12.5 is another extraction candidate requiring symlink/traversal, duplicate-entry, absolute-path, resource-limit and API review. Adding either directly does not remove extract-zip from Puppeteer's dependency tree. Replacing a nested package with an unrelated API by override is unsafe.
- **upstream browser chain:** @puppeteer/browsers 3.2.5 uses modern-tar instead of extract-zip, but declares Node >=22.12.0 and changes major. It cannot be forced beneath Puppeteer 24 or satisfy Node 20. Review the complete parent migration and audit before any adoption.

Only tinyglobby was installed into production. Isolated lock-only audits of tinyglobby, glob, yauzl and unzipper returned zero findings at investigation time (candidate-audits.json). The ZIP readers were not adopted, and a clean candidate audit is not proof of extraction containment or API compatibility.

## Validation

Baseline build and 284 source tests passed, with 0 failures/skips; both release-policy tests passed. Baseline Labs 11/12/13 passed. The first baseline Lab 14 scans passed but its repository-integrity check correctly failed because this documentation was edited concurrently. That exit-1 evidence is preserved under lab14-first-run. A second baseline run with repository files held unchanged passed all functional and cleanup checks and returned the expected security-only exit 3. No assertion was weakened.

Post-replacement validation on Windows x64 / Node 22.14.0:

| Validation | Result |
|---|---|
| npm ci | PASS, updated lock reproduced |
| npm run build | PASS |
| Complete npm test | **292 passed, 0 failed, 0 skipped**: 284 existing plus eight new discovery regressions |
| Release security policy tests | 2 passed, 0 failed |
| New discovery tests on Node 20.20.2 | 8 passed, 0 failed, 0 skipped |
| New discovery tests on Node 22.14.0 | 8 passed, 0 failed, 0 skipped; also included in the full suite |
| New discovery tests on Node 24.22.0 | 8 passed, 0 failed, 0 skipped |
| Lab 11 | PASS, harness exit 0; clean/regression/recovery scores 100/94/100, scanner exits 0/2/0 |
| Lab 12 | PASS, harness exit 0; clean/defect scores 100/96, scanner exits 0/2 |
| Lab 13 | PASS, harness exit 0; clean/defect/recovery scores 100/96/100, scanner exits 0/2/0 |
| Lab 14 functional/packaging | PASS; clean/defect/recovery scores 100/96/100, scanner exits 0/2/0 |
| Lab 14 release gate | **BLOCKED**, expected security-only harness exit 3 |
| Lab 14 coverage/confidence | 100% and FULL for all three scenarios; no ERROR/PARTIAL/TIMEOUT/SKIPPED scanner |
| Lab 14 cleanup | PASS: tempRemoved/sourceUnchanged/consumerOutsideRepository/ownedChildrenStopped all true |
| Reports | HTML, JSON, Markdown and PDF generated and checked by the package harnesses |
| git diff --check | PASS |

The installed tarball is qa-check-cli@1.3.0, **157 packaged files**, 149,377 compressed bytes and 634,418 unpacked bytes. The additional file is the compiled shared discovery helper. The production dependency tree has no fast-glob, micromatch or braces nodes; the vulnerable libraries were not retained as development dependencies. Remaining high entries are @puppeteer/browsers, basic-ftp, extract-zip, get-uri, lighthouse, pac-proxy-agent, proxy-agent and puppeteer-core. The 19 underlying moderate entries are the T entries above. The consumer adds qa-check-cli@1.3.0, moderate, via lighthouse.

Node 20/24 discovery tests used isolated npm-cached runtimes with their actual executable paths and versions recorded in node-runtime-results.json; they did not replace the system Node installation. Those small tests do not substitute for complete hosted package/scanner validation. Full source and Labs 11–14 were executed on Windows/Node 22 only. The updated Windows/Ubuntu/macOS × Node 20/22/24 hosted matrix remains pending. Earlier green Lab 14 hosted jobs covered the previous dependency tree, not this change.

## Changed files

- package.json and package-lock.json: remove the vulnerable glob dependency subtree; add the reviewed replacement; no other surviving resolution changes version.
- src/utils/sourceGlob.ts: shared glob compatibility and filesystem-error adapter.
- src/crawler.ts, src/build.ts, src/lint.ts and src/pipeline/runtime.ts: use the shared helper.
- src/checks/accessibility.ts, brokenImages.ts, brokenLinks.ts, laravelSecurity.ts, responsive.ts and seo.ts: import replacement helper; scanner rules and scores unchanged.
- src/utils/sourcePolicy.ts: remove the old library name from its shared-ignore comment.
- src/tests/sourceGlob.test.ts: eight portable discovery/error regressions.
- docs/lab15-security-remediation.md: this report.

## Remaining decision and reproduction

Keep release BLOCKED. Review the compatible glob change and rerun the existing hosted matrix. Separately decide whether to preserve Node 20 via an upstream-supported fix/backport, or explicitly approve a minimum-runtime change and Lighthouse 13 metric/scoring migration. Do not force OpenTelemetry 2, browser-manager 3, basic-ftp 6 or a ZIP-reader replacement beneath incompatible parent ranges. Do not waive the eight remaining high entries because their vulnerable operations were not found on the normal scan path.

Run these sequentially with repository edits paused until each harness completes:

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
git branch --show-current
npm ci
npm run build
npm test
node --test tests/integration/release-security.test.mjs
node tests/integration/lab11-cicd.mjs
node tests/integration/lab12-package.mjs
node tests/integration/lab13-platform.mjs
node tests/integration/lab14-release.mjs
$releaseExit = $LASTEXITCODE
Write-Host "Lab 14 release exit: $releaseExit" # Currently 3, security-only BLOCKED
Get-Content test-reports/lab14-release/win32/results.json
npm audit --omit=dev --json # Currently exits 1 with valid vulnerability evidence
git diff --check
git status --short
```

Check every command's actual exit; stop and investigate unexpected failures. Lab 14 returning 1 indicates a functional or cleanup problem, not the expected security-only block. No command above publishes, commits or pushes anything.

## Sources

- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-jmr9-qjv8-65gv
- https://github.com/advisories/GHSA-7pqw-9j4j-h8q3
- https://github.com/advisories/GHSA-c475-qrg2-pj4r
- https://github.com/advisories/GHSA-8988-4f7v-96qf
- https://github.com/advisories/GHSA-qqmp-wf37-98f9
- https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0
- https://github.com/SuperchupuDev/tinyglobby

Registry version/engine/dependency metadata was fetched on 2026-10-21 and retained under test-reports/lab15-security. Audit reachability is independent from the strict release-policy decision.

