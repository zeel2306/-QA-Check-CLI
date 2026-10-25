# Security remediation and release-readiness follow-up

Investigation date: 2026-10-21. Package: qa-check-cli@1.3.0. Baseline: testing-branch, c5f48fe. Production dependencies, workflows and release policy are unchanged.

## Decision

Release remains **BLOCKED**. No further compatible production fix was demonstrated within the current dependency ranges. Breaking or architectural remediation has stopped at option analysis, as requested. No Node support change, root production override, shrinkwrap, vulnerability suppression or audit-threshold change was applied.

The previously completed tinyglobby migration is already part of this baseline. Its removal of fast-glob/micromatch/braces is not counted as a new improvement here.

| Scope | Fresh before | After investigation |
|---|---|---|
| Source production | 27 entries: 8 high, 19 moderate, 0 critical | 27 entries: 8 high, 19 moderate, 0 critical |
| Packed external consumer | 28 entries: 8 high, 20 moderate, 0 critical | 28 entries: 8 high, 20 moderate, 0 critical |

Counts include inherited parent entries, not eight separate high-severity exploits. Every high/critical entry remains blocking even where its vulnerable operation was not found on the normal scan path. The strict existing policy also rejects incomplete audit evidence.

The consumer before/after counts come from separate fresh tarball installations: the initial external audit consumer and the final Lab 14 consumer. Both were outside the source checkout and removed after evidence capture. All eight high entries have identical affected versions in source and consumer (source-consumer-blocker-comparison.json). The consumer's additional moderate entry is qa-check-cli@1.3.0 itself, inherited through Lighthouse, not a new independent advisory. The fresh full source audit also reports 27 entries, with no additional development-only findings. No new remediation credit is claimed because no production dependency changed.

## Every high/critical entry and its origin

| High/critical package | Version | Production path | Origin |
|---|---|---|---|
| @puppeteer/browsers | 2.13.2 | lighthouse → puppeteer-core → @puppeteer/browsers | extract-zip; proxy-agent |
| basic-ftp | 5.3.1 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri → basic-ftp | https://github.com/advisories/GHSA-c475-qrg2-pj4r |
| extract-zip | 2.0.1 | lighthouse → puppeteer-core → @puppeteer/browsers → extract-zip | https://github.com/advisories/GHSA-jmr9-qjv8-65gv; https://github.com/advisories/GHSA-7pqw-9j4j-h8q3 |
| get-uri | 6.0.5 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri | basic-ftp |
| lighthouse | 12.8.2 | lighthouse | @sentry/node; puppeteer-core |
| pac-proxy-agent | 7.2.0 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent | get-uri |
| proxy-agent | 6.5.0 | lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent | pac-proxy-agent |
| puppeteer-core | 24.43.1 | lighthouse → puppeteer-core | @puppeteer/browsers |

All eight high entries originate in the direct Lighthouse dependency. The underlying high advisories are:

- basic-ftp: GHSA-c475-qrg2-pj4r, quadratic CPU cost parsing server directory listings. Installed 5.3.1 is affected; <=6.2.0 is affected and 6.2.1 is the first patched release. The reviewed latest candidate is 6.2.3.
- extract-zip: GHSA-jmr9-qjv8-65gv and GHSA-7pqw-9j4j-h8q3, unsafe symbolic-link extraction/path traversal and arbitrary file writes. Installed/latest checked 2.0.1 remains affected. No patched release is listed.
- The other six entries inherit affected children. Changing only their package version labels does not establish a fix.

Source inventory.json and source-tree.json under test-reports/release-security-current retain every finding, resolved version, node path, via chain and npm fix proposal. All 19 moderate entries are in Lighthouse's Sentry/OpenTelemetry subtree. @opentelemetry/core 1.30.1 is affected by the baggage-allocation advisory (<2.8.0); database instrumentation packages additionally have database-attribute disclosure findings. The existing detailed inventory in docs/lab15-security-remediation.md remains applicable; fresh JSON, rather than old counts, is authoritative.

## Production reachability

This is call-site review, not exploitation testing, proof of safety or an exemption from the gate.

- QA launches its owned Chrome and Lighthouse attaches through puppeteer.connect. It does not invoke Puppeteer's browser installer on the normal audit path. extract-zip is dynamically imported by @puppeteer/browsers archive extraction. The FTP/PAC chain originates in the downloader/proxy helpers. The installed vulnerable code remains present; proxy environment inputs and future API use need review.
- Lighthouse's Sentry initializer returns before importing @sentry/node unless enableErrorReporting is enabled. QA's fixed Lighthouse options do not enable it. The vulnerable telemetry/instrumentation operations were not demonstrated on the current normal path. That does not waive any finding.
- The current Lighthouse worker is cancellation/process-lifecycle isolation using worker_threads. It is not a security sandbox or dependency removal. Its dependencies remain installed and audited in both source and packed consumer.

## Current upgrade and replacement evidence

Registry queries were refreshed, not inferred from the previous investigation:

| Candidate | Verified result | Decision |
|---|---|---|
| Lighthouse 12 | Latest in major remains 12.8.2 | No compatible patched release found |
| Puppeteer 24 | Latest remains 24.43.1, browser manager pinned to 2.13.2 | Does not remove vulnerable ZIP/proxy subtree |
| Browser manager 2 | Latest remains 2.13.2, depends on extract-zip ^2.0.1 | No compatible patched manager found |
| get-uri 6 | Latest 6.0.5, requires basic-ftp ^5.0.2 | FTP 6 is outside the parent range |
| basic-ftp 5 | Latest 5.3.1 | No current 5.x patch for the listing-parser advisory |
| Sentry 9 | Latest 9.47.2 still requires OpenTelemetry core ^1.30.1 and pins affected instrumentations | The available 9.47.1 → 9.47.2 patch does not resolve this cohort |
| Lighthouse 13.5.0 | Fresh isolated lock-only audit: 0 vulnerabilities; engine >=22.19 | Not applied: breaks required Node 20 support and this local Node 22.14.0 |
| Review-only FTP 6.2.3 override beneath Lighthouse 12 | Isolated lock-only audit: 4 high + 19 moderate = 23, versus source's 8 high + 19 moderate = 27 | Partial candidate only, not a production fix; ZIP vulnerabilities remain |

The FTP 6 candidate still supports Node >=10 and uses CommonJS. It was not rejected because of an invented Node 20 or ESM incompatibility. Its upstream release notes explicitly change the default to reject separate transfer hosts. get-uri creates a Client without opting into the old behavior. A forced cross-major replacement therefore needs real compatibility review, including loopback FTP/PAC, error behavior, supported transfer configurations and all three Node majors. No FTP server, untrusted archive or intrusive payload was tested here.

Only manifests/lockfiles were resolved inside ignored investigation folders for the two candidate audits, with lifecycle scripts disabled. Neither candidate was installed into the CLI or executed as its scanner. The 23-entry candidate result is not reported as the actual source result.

### Why a root-only override or pruning is insufficient

npm only applies overrides from an installation's root package.json; overrides inside an installed dependency are ignored. Adding a CLI-root override could improve the source audit while leaving an independently installed tarball vulnerable. That would not meet the release objective.

A published npm-shrinkwrap.json can impose a CLI's dependency tree, but it is a distribution-policy change requiring review, fresh install/update tests, minimum-runtime validation and an ongoing patch/update policy. It does not itself patch vulnerable source. No shrinkwrap was introduced. Even a correctly distributed FTP-only fix leaves four high entries and does not clear the strict gate.

Moving Lighthouse to devDependencies, making it optional and skipping its audit/scanner, pruning node_modules after install, suppressing advisories or weakening coverage would conceal risk or remove functionality; none is proposed as remediation.

### Legitimate options requiring a decision

1. **Keep Node 20 with maintained upstream fixes/backports.** Work with the Lighthouse/Puppeteer browser-management and telemetry owners, or approve a maintained fork. Patch/remove the ZIP and FTP vulnerable operations through reviewed code, upgrade the telemetry cohort coherently and preserve Lighthouse 12 output contracts. This creates maintenance, provenance, licensing/SBOM and security-update obligations; no fork/backport was silently created.
2. **Approve a minimum runtime of >=22.19 and migrate Lighthouse 13.5.** Its isolated dependency audit is clean, but that is not full CLI validation. Update the TTFB/insight mapping and category/scoring integration with evidence, then rebuild/audit the entire packed QA consumer and run all source tests and Labs 11–14 across supported platforms. The min-runtime change and workflow changes require approval and have not been made.
3. **Keep Node 20 for the core CLI with a separately versioned newer-runtime performance sidecar.** A real patched sidecar could isolate the modern Lighthouse dependency graph, but requires a protocol, explicit runtime acquisition/update policy, process cleanup, offline/install behavior, integrity checks and audits for every shipped component. Removing vulnerable dependencies from the core while leaving an unsafe sidecar would not satisfy the security objective. This is a major architectural change; stopped before implementation.

Remote performance services or a different metrics engine would also change privacy, offline behavior or score semantics and are not drop-in fixes. Missing performance evidence must remain an incomplete audit, not a PASS.

## Validation and package isolation

Fresh local validation completed on Windows x64:

| Check | Runtime | Actual result |
|---|---|---|
| npm run build | Node 22.14.0 | PASS, exit 0 |
| Complete npm test | Node 22.14.0 | **292 passed, 0 failed, 0 skipped**, exit 0 |
| Security-policy tests | Node 22.14.0 | 2 passed, 0 failed, exit 0 |
| Lab 11 | Node 22.14.0 | PASS, harness exit 0; clean/regression/recovery scores 100/94/100 and scanner exits 0/2/0 |
| Lab 12 | Node 22.14.0 | PASS, harness exit 0; clean/defect scores 100/96 and scanner exits 0/2 |
| Lab 13 | Node 22.14.0 | PASS, harness exit 0; clean/defect/recovery scores 100/96/100 and scanner exits 0/2/0 |
| Lab 14 | Node 22.14.0 | Functional PASS; strict security-only release block, harness exit **3**; scans 100/96/100 and exits 0/2/0 |
| Full Lab 12 packed-package installation/scans | Node 20.20.2 | PASS, harness exit 0; clean 100/exit 0, defect 96/exit 2 |
| Full Lab 12 packed-package installation/scans | Node 24.22.0 | PASS, harness exit 0; clean 100/exit 0, defect 96/exit 2 |
| Coverage/confidence | All package scan scenarios | 100% / FULL; incomplete scanners rejected by existing assertions |
| Reports | Package harnesses | HTML, JSON, Markdown and PDF generated and checked |
| Cleanup | Final package harnesses | External consumers/temp storage removed; source unchanged during execution; Lab 13/14 owned-child cleanup flags true |
| git diff --check | Source checkout | PASS |

Each harness used the actual local npm pack tarball and installed absolute bin with isolation guards; it did not invoke a global QA CLI or import source modules into the installed CLI. Node 20/24 executable paths and actual consumer browser-probe runtime identities were verified. These are full clean/defect package scans on all three majors, not only version or discovery tests. The package remains qa-check-cli@1.3.0, with 157 packaged files; the successful builds/package manifests derive sizes and integrity from npm pack rather than a hardcoded contract.

The source suite and Labs 11/13/14 were rerun under Node 22 only; Lab 12 was rerun under all three majors. These local runs were Windows-only. No new hosted Ubuntu/macOS run was dispatched. Existing green hosted evidence is for the same unchanged production commit, but is not represented as a newly executed matrix.

The first investigation-only verification helper read a nonexistent environment.json after Lab 12 had passed. It was corrected to read the existing browser-environment.json, and Lab 12 was rerun successfully; the first attempt's logs/reports remain under validation/node22/lab12-package. No production test/assertion was changed. Subsequent actual harness exits were recorded separately in validation-exits.json. The diagnostic runner retains the release-block exit 3 rather than converting it to success; an explicit PowerShell exit preserves that native code.

Repository files were held unchanged during package harnesses to preserve their source-integrity checks. Test outputs, both consumer locks/trees, raw audits, candidate graphs, per-runtime reports and final-summary.json are under the ignored test-reports/release-security-current directory.

## Runtime security lifecycle: a separate approval decision

As of this investigation date, Node.js lists **Node 20 as EOL**. Upstream EOL versions no longer receive security patches. Functional compatibility with Node 20.20.2 is therefore not evidence of ongoing upstream runtime security support. No runtime CVEs were added to the npm dependency counts and no release threshold was changed.

Node 20 compatibility and package engines >=20 are preserved as requested. A genuinely security-supported production release needs an explicit runtime-support decision: move to supported, currently patched LTS runtimes, or evaluate an independently maintained extended-support arrangement for retained Node 20 users. Backporting Lighthouse dependencies alone does not solve an EOL runtime's maintenance status. Node 22.14.0 here is the actual local compatibility-test runtime, not a recommendation to deploy an old patch level; use current security-patched releases of maintained lines for release qualification.

## Modified files and next approval

Added docs/release-security-readiness-investigation.md. No production source, manifest, lockfile, tests, workflow or security policy changed. The existing untracked docs/lab13-c5f48fe-ci-investigation.md was left unchanged. Investigation evidence and helper scripts are ignored artifacts, not packaged runtime files.

Release recommendation: **BLOCKED**. The recommended decision is whether to retire Node 20 and approve the supported-runtime/Lighthouse 13 migration, or explicitly fund/review the Node-20-compatible backport and runtime-support path. The sidecar is a third architectural option. None has been implemented without approval.

## Sources

- https://github.com/advisories/GHSA-c475-qrg2-pj4r
- https://github.com/advisories/GHSA-jmr9-qjv8-65gv
- https://github.com/advisories/GHSA-7pqw-9j4j-h8q3
- https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.0.0
- https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0
- https://docs.npmjs.com/cli/v10/configuring-npm/package-json/#overrides
- https://docs.npmjs.com/cli/v10/configuring-npm/npm-shrinkwrap-json/
- https://nodejs.org/en/about/previous-releases
- https://nodejs.org/en/about/eol

No commit, push, merge, tag, npm publication or workflow change was performed.

