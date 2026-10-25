# Dependency security investigation and narrow remediation

Baseline: testing-branch, cc408fb. Investigation date: 2026-10-15. No force fix, vulnerability suppression, dependency override, major-version application, commit, push or publication.

## Decision and counts

Production audit before: 32 affected package entries (19 moderate, 13 high). After: 30 (19 moderate, 11 high). Both all-dependency and omit-dev audits retain the same production findings; these counts include propagated parents, not 32 independent exploits. Audits correctly still exit 1. Evidence is in test-reports/dependency-security, including before/after JSON, dependency paths, version/engine metadata and validation logs.

Only package-lock.json dependency resolutions changed: brace-expansion 2.1.2 → 2.1.7, within minimatch's ^2.0.2; ip-address 10.2.0 → 10.7.4, within socks' ^10.1.1. No package.json ranges changed. npm also synchronized stale root lockfile version 1.1.5 to the existing package.json version 1.3.0 and normalized those two entries' metadata. No other dependency version changed.

Distribution limit: these counts describe the source lockfile reproduced by npm ci. The npm tarball does not contain package-lock.json; a consumer resolves the existing dependency ranges independently. Current ranges permit the patched versions, but this lockfile-only change does not impose new minimum versions on consumers or upgrade already-installed copies. Do not claim all consumer installations are fixed. A separately reviewed CLI shrinkwrap/distribution policy or upstream parent minimum-version update would be needed to enforce a specific consumer dependency tree; no shrinkwrap or forced override was introduced here.

Commands used: npm audit --json; npm audit --omit=dev --json; a non-mutating npm audit fix --dry-run --ignore-scripts; npm update brace-expansion ip-address --ignore-scripts --no-audit --no-fund; npm ci; npm run build. No broad fix was applied. A compatible Sentry 9.47.2 patch exists but retains Core ^1.30.1, so it does not resolve the telemetry advisory. It was not included as an unrelated update. Puppeteer 24's latest registry release remains 24.43.1, so a compatible patch cannot clear the reported parent chain.

## Runtime reachability

This is code-path analysis of the installed runtime and CLI call sites, not a proof of exploitation or a claim that installed vulnerable code is safe. No hostile archive, recursive pattern, FTP/PAC response or telemetry payload was executed.

- src/crawler.ts, src/build.ts, src/lint.ts and static scanner modules use fast-glob with bounded source-code literals (e.g. **/*.html and src/**/*.{js,jsx,ts,tsx,vue}). Source filenames/cwd are input data, not user-provided brace patterns in the inspected calls. The vulnerable matcher is active, but a current CLI entry path that feeds deeply nested attacker-controlled patterns to its parser was not found. Future configuration/extensions must not assume the dependency is patched.
- src/checks/lighthouse.ts starts Chrome via the owned launcher and calls lighthouse(url, {port, output, logLevel, maxWaitForLoad, onlyCategories}). Lighthouse core/gather/navigation-runner.js uses puppeteer.connect({browserURL: localhost port}). It does not call Puppeteer's browser installer. The extract-zip, FTP/PAC/proxy helpers are in the installed browser-management subtree; their vulnerable operations were not found on the normal audit path. Playwright's separate explicit browser installer is not this Puppeteer downloader.
- Lighthouse core/lib/sentry.js checks !opts.flags.enableErrorReporting and returns before dynamically importing @sentry/node. QA Check does not set that flag. Sentry/OpenTelemetry, including its minimatch helper, are therefore gated off on the current normal audit path. Database username disclosure additionally needs active database instrumentation/trace export; none is configured by QA Check. This reduces current reachability; it does not justify deleting or ignoring the 19 findings.
- The ip-address patch is still appropriate for the optional SOCKS/proxy path: it preserves the major/API range and corrects address-classification edge cases. The brace-expansion patch similarly preserves its caller's API/range. Registry metadata and integrity values are retained in the lockfile.

## Complete inventory: all 32 original findings

Each section includes the installed/affected version, direct/transitive path, remediation decision and reachability. When npm reports only inherited advisories, there is no independently proven fixed version of that parent: fixing the underlying dependency or upgrading/removing the parent cohort is required. Minimum version boundaries from individual advisories are not recommendations to override a parent's incompatible semver range.

### @opentelemetry/core

- Severity: moderate; transitive dependency.
- Installed: 1.30.1; after remediation: 1.30.1. Audit affected range: `<2.8.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/core.
- Fixed version / action: Core 2.8.0; incompatible with Sentry 9 core ^1.30.1.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- [OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation](https://github.com/advisories/GHSA-8988-4f7v-96qf); individual affected range: `<2.8.0`.

### @opentelemetry/instrumentation-amqplib

- Severity: moderate; transitive dependency.
- Installed: 0.46.1; after remediation: 0.46.1. Audit affected range: `<=0.46.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-amqplib.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-connect

- Severity: moderate; transitive dependency.
- Installed: 0.43.1; after remediation: 0.43.1. Audit affected range: `<=0.43.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-connect.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-express

- Severity: moderate; transitive dependency.
- Installed: 0.47.1; after remediation: 0.47.1. Audit affected range: `<=0.47.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-express.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-fs

- Severity: moderate; transitive dependency.
- Installed: 0.19.1; after remediation: 0.19.1. Audit affected range: `<=0.19.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-fs.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-hapi

- Severity: moderate; transitive dependency.
- Installed: 0.45.2; after remediation: 0.45.2. Audit affected range: `0.24.0 - 0.45.2`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-hapi.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-http

- Severity: moderate; transitive dependency.
- Installed: 0.57.2; after remediation: 0.57.2. Audit affected range: `<=0.16.0 || 0.19.1-alpha.7 - 0.218.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-http.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-knex

- Severity: moderate; transitive dependency.
- Installed: 0.44.1; after remediation: 0.44.1. Audit affected range: `<0.65.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-knex.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- [Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9); individual affected range: `<0.65.0`.

### @opentelemetry/instrumentation-koa

- Severity: moderate; transitive dependency.
- Installed: 0.47.1; after remediation: 0.47.1. Audit affected range: `<=0.15.0 || 0.20.0 - 0.47.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-koa.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/instrumentation-mongoose

- Severity: moderate; transitive dependency.
- Installed: 0.46.1; after remediation: 0.46.1. Audit affected range: `<=0.66.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-mongoose.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.
- [Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9); individual affected range: `<0.67.0`.

### @opentelemetry/instrumentation-mysql

- Severity: moderate; transitive dependency.
- Installed: 0.45.1; after remediation: 0.45.1. Audit affected range: `<0.67.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-mysql.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- [Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9); individual affected range: `<0.67.0`.

### @opentelemetry/instrumentation-mysql2

- Severity: moderate; transitive dependency.
- Installed: 0.45.2; after remediation: 0.45.2. Audit affected range: `<=0.66.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-mysql2.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/sql-common.
- [Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9); individual affected range: `<0.67.0`.

### @opentelemetry/instrumentation-pg

- Severity: moderate; transitive dependency.
- Installed: 0.51.1; after remediation: 0.51.1. Audit affected range: `<=0.72.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-pg.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core, @opentelemetry/sql-common.
- [Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9); individual affected range: `<0.73.0`.

### @opentelemetry/instrumentation-tedious

- Severity: moderate; transitive dependency.
- Installed: 0.18.1; after remediation: 0.18.1. Audit affected range: `<0.40.0`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-tedious.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- [Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9); individual affected range: `<0.40.0`.

### @opentelemetry/instrumentation-undici

- Severity: moderate; transitive dependency.
- Installed: 0.10.1; after remediation: 0.10.1. Audit affected range: `<=0.10.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-undici.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/resources

- Severity: moderate; transitive dependency.
- Installed: 1.30.1; after remediation: 1.30.1. Audit affected range: `0.8.0 - 2.7.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/resources.
- Fixed version / action: Parent must permit OpenTelemetry 2.8+; not a compatible 1.x update.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @opentelemetry/sdk-trace-base

- Severity: moderate; transitive dependency.
- Installed: 1.30.1; after remediation: 1.30.1. Audit affected range: `<=2.7.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/sdk-trace-base.
- Fixed version / action: Parent must permit OpenTelemetry 2.8+; not a compatible 1.x update.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core, @opentelemetry/resources.

### @opentelemetry/sql-common

- Severity: moderate; transitive dependency.
- Installed: 0.40.1; after remediation: 0.40.1. Audit affected range: `<=0.40.1`.
- Production path: lighthouse → @sentry/node → @opentelemetry/instrumentation-mysql2 → @opentelemetry/sql-common.
- Fixed version / action: Upstream instrumentation/core upgrade; see advisory ranges below; do not force Core 2 over 1.x.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core.

### @puppeteer/browsers

- Severity: high; transitive dependency.
- Installed: 2.13.2; after remediation: 2.13.2. Audit affected range: `*`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- Propagated via: extract-zip, proxy-agent.

### @sentry/node

- Severity: moderate; transitive dependency.
- Installed: 9.47.1; after remediation: 9.47.1. Audit affected range: `8.0.0-alpha.1 - 10.53.1`.
- Production path: lighthouse → @sentry/node.
- Fixed version / action: Upgrade upstream parent/SDK cohort; compatible 9.47.2 still requires Core ^1.30.1.
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- Propagated via: @opentelemetry/core, @opentelemetry/instrumentation-amqplib, @opentelemetry/instrumentation-connect, @opentelemetry/instrumentation-express, @opentelemetry/instrumentation-fs, @opentelemetry/instrumentation-hapi, @opentelemetry/instrumentation-http, @opentelemetry/instrumentation-knex, @opentelemetry/instrumentation-koa, @opentelemetry/instrumentation-mongoose, @opentelemetry/instrumentation-mysql, @opentelemetry/instrumentation-mysql2, @opentelemetry/instrumentation-pg, @opentelemetry/instrumentation-tedious, @opentelemetry/instrumentation-undici, @opentelemetry/resources, @opentelemetry/sdk-trace-base.

### basic-ftp

- Severity: high; transitive dependency.
- Installed: 5.3.1; after remediation: 5.3.1. Audit affected range: `<=6.2.0`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri → basic-ftp.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- [basic-ftp: Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser (RE_LINE backtracking)](https://github.com/advisories/GHSA-c475-qrg2-pj4r); individual affected range: `<=6.2.0`.

### brace-expansion

- Severity: high; transitive dependency.
- Installed: 2.1.2; after remediation: 2.1.7. Audit affected range: `2.0.0 - 2.1.6`.
- Production path: lighthouse → @sentry/node → minimatch → brace-expansion.
- Fixed version / action: 2.1.7 applied (all listed ranges cleared).
- Reachability: Telemetry/minimatch subtree; Lighthouse Sentry init returns before SDK import unless enableErrorReporting is true; QA Check does not enable it.
- [brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg); individual affected range: `>=2.0.0 <2.1.3`.
- [brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895); individual affected range: `>=2.0.0 <2.1.4`.
- [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr); individual affected range: `>=2.0.0 <2.1.7`.
- [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7); individual affected range: `>=2.0.0 <2.1.6`.
- [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p); individual affected range: `>=2.0.0 <2.1.5`.

### braces

- Severity: high; transitive dependency.
- Installed: 3.0.3; after remediation: 3.0.3. Audit affected range: `*`.
- Production path: fast-glob → micromatch → braces.
- Fixed version / action: No patched chain reported; latest fast-glob still 3.3.3.
- Reachability: Active scanner matching with fixed literal patterns; dangerous nested user-controlled patterns not found at current call sites.
- [braces vulnerable to stack-exhaustion denial of service through deeply nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm); individual affected range: `<=3.0.3`.

### extract-zip

- Severity: high; transitive dependency.
- Installed: 2.0.1; after remediation: 2.0.1. Audit affected range: `*`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers → extract-zip.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- [extract-zip unvalidated symlink path traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv); individual affected range: `<=2.0.1`.
- [extract-zip allows arbitrary file writes through symlink archive entries](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3); individual affected range: `<=2.0.1`.

### fast-glob

- Severity: high; direct dependency.
- Installed: 3.3.3; after remediation: 3.3.3. Audit affected range: `*`.
- Production path: fast-glob.
- Fixed version / action: No patched chain reported; latest fast-glob still 3.3.3.
- Reachability: Active scanner matching with fixed literal patterns; dangerous nested user-controlled patterns not found at current call sites.
- Propagated via: micromatch.

### get-uri

- Severity: high; transitive dependency.
- Installed: 6.0.5; after remediation: 6.0.5. Audit affected range: `>=5.0.0`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent → get-uri.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- Propagated via: basic-ftp.

### ip-address

- Severity: high; transitive dependency.
- Installed: 10.2.0; after remediation: 10.7.4. Audit affected range: `<=10.7.0`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → socks-proxy-agent → socks → ip-address.
- Fixed version / action: 10.7.4 applied; audit range ends at 10.7.0.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- [ip-address: Address4 decodes leading-zero octets as decimal while resolvers decode them as octal, allowing SSRF and trust-boundary bypass](https://github.com/advisories/GHSA-mwp4-54f8-5fhr); individual affected range: `<=10.3.0`.
- [ip-address: a CIDR suffix on the parsed address suppresses special-use classification and can bypass SSRF and trust-boundary checks](https://github.com/advisories/GHSA-4xrf-jv44-h6hh); individual affected range: `>=10.1.1 <=10.2.1`.
- [ip-address: misclassification of IPv4-mapped/NAT64 IPv6 addresses can bypass SSRF and trust-boundary checks](https://github.com/advisories/GHSA-22jq-vg5j-6vgg); individual affected range: `>=10.1.1 <=10.2.0`.
- [ip-address: Address6.isLinkLocal() recognizes fe80::/64 rather than fe80::/10, allowing SSRF and trust-boundary bypass to on-link hosts](https://github.com/advisories/GHSA-rpw4-54j3-4h4q); individual affected range: `<=10.5.0`.
- [ip-address: no classifier recognizes the NAT64 local-use range 64:ff9b:1::/48, allowing SSRF and trust-boundary bypass](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc); individual affected range: `>=10.2.0 <=10.5.0`.
- [ip-address: isInSubnet() and isHostInSubnet() compare addresses of different families as if they shared an address space, allowing an allowlist check to admit an address outside its range](https://github.com/advisories/GHSA-j6r3-76f7-8jcv); individual affected range: `<=10.7.0`.
- [ip-address: Address6 builds a parse diagnostic proportional to the input with no length bound, allowing a single long string to stall or crash the process](https://github.com/advisories/GHSA-h3mg-xc3c-68pw); individual affected range: `<=10.7.0`.

### lighthouse

- Severity: high; direct dependency.
- Installed: 12.8.2; after remediation: 12.8.2. Audit affected range: `10.1.1-dev.20230414 - 10.1.1-dev.20230503 || 10.2.0-dev.20230504 - 13.4.0`.
- Production path: lighthouse.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Active Lighthouse/CDP connection; inherited downloader/telemetry advisories need separate vulnerable-operation reachability.
- Propagated via: @sentry/node, puppeteer-core.

### micromatch

- Severity: high; transitive dependency.
- Installed: 4.0.8; after remediation: 4.0.8. Audit affected range: `>=0.2.0`.
- Production path: fast-glob → micromatch.
- Fixed version / action: No patched chain reported; latest fast-glob still 3.3.3.
- Reachability: Active scanner matching with fixed literal patterns; dangerous nested user-controlled patterns not found at current call sites.
- Propagated via: braces.

### pac-proxy-agent

- Severity: high; transitive dependency.
- Installed: 7.2.0; after remediation: 7.2.0. Audit affected range: `>=6.0.0`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent → pac-proxy-agent.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- Propagated via: get-uri.

### proxy-agent

- Severity: high; transitive dependency.
- Installed: 6.5.0; after remediation: 6.5.0. Audit affected range: `>=6.0.0`.
- Production path: lighthouse → puppeteer-core → @puppeteer/browsers → proxy-agent.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Browser-download/proxy subtree; current Lighthouse path connects to owned Chrome, not Puppeteer download/FTP/PAC helpers.
- Propagated via: pac-proxy-agent.

### puppeteer-core

- Severity: high; transitive dependency.
- Installed: 24.43.1; after remediation: 24.43.1. Audit affected range: `19.8.4 - 24.43.1`.
- Production path: lighthouse → puppeteer-core.
- Fixed version / action: npm proposes Lighthouse 13.5.0 to replace/update this chain; no independently safe parent-compatible fix established.
- Reachability: Active Lighthouse/CDP connection; inherited downloader/telemetry advisories need separate vulnerable-operation reachability.
- Propagated via: @puppeteer/browsers.

## High-priority remaining work

1. fast-glob → micromatch → braces still has no reported patched chain. Do not pin an equally vulnerable older release or override a nonexistent fix. Track an upstream depth-limit fix or evaluate a compatible matcher replacement with all framework route/source-discovery tests. Preserve fixed trusted patterns meanwhile; no new ignore rule or audit waiver was added. [Upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
2. Evaluate the Lighthouse major in an isolated migration rather than force-upgrading its transitive packages. The SDK/browser dependencies are coupled; forcing Sentry/Core, FTP or Puppeteer across their parent's declared major boundaries is not a low-risk fix. Confirm which advisories the resulting resolved graph removes with a fresh audit; the recommendation is not proof of a zero-vulnerability graph.
3. Keep the current blocked-off telemetry/downloader paths blocked by default. If enabling error reporting or proxy/downloader features later, repeat reachability review and security tests before release. Do not mistake gating for remediation.

## Lighthouse 13 compatibility evaluation (not applied)

- Current library: 12.8.2; latest compatible 12.x metadata remains 12.8.2. Proposed audit remediation: 13.5.0. Its engines require Node >=22.19, incompatible with this package's >=20 promise and local Node 22.14.0. The generic setup-node '22' Actions configuration can choose a newer patch, but local/minimum runtime support must be deliberately changed before adopting the major.
- Registry dependencies move Puppeteer from ^24.17.1 to ^25.9.0 and Sentry from ^9.28.1 to ^10.0.0. These are not safe independent overrides. lighthouse-logger remains declared at ^2.0.2. The callable API/RunnerResult shape is broadly similar, but full type and runtime validation on supported Node is still required; version 13 was not executed under an unsupported runtime.
- [Upstream 13.0 release notes](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0) remove legacy audits/artifacts, adjust accessibility weights, change trace processing and host-browser emulation. Category scores, audit IDs, timing, source-map diagnostics and thresholds can change even if the TypeScript call compiles. [13.5 notes](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.5.0) add further audit/configuration changes.
- Concrete adapter risk: QA Check reads TTFB from audits['server-response-time'].numericValue. Upstream moves that audit to Document Latency insight; the current optional access can silently yield an absent metric. Map/validate the replacement explicitly, preserve missing-evidence semantics and test baseline metric comparability. CLS/LCP/FCP/INP and category presence also need revalidation.
- Migration acceptance: decide Node engine compatibility; install the major in an isolated test environment on Node >=22.19; compile; run all unit tests; run real multi-route Lab 11 and external-tarball Lab 12; compare JSON/HTML fields, 100% coverage/FULL confidence, route timeouts/cleanup and CI exit codes; then establish a reviewed new performance baseline. Do not compare changed scoring models as though their metrics are identical or force existing goldens to pass.

## Validation

All requested validation completed sequentially against the updated lockfile on Windows, Node 22.14.0:

| Validation | Result |
| --- | --- |
| npm ci | PASS, 284 packages installed |
| npm run build | PASS |
| npm test | 282 passed, 0 failed, 0 skipped |
| Lab 11 clean | score 100, quality gate PASS, exit 0 |
| Lab 11 regression | score 94, seeded defects detected, both gates FAIL as expected, exit 2 |
| Lab 11 recovery | score 100, both gates PASS, exit 0 |
| Lab 11 harness | exit 0 |
| Lab 12 external tarball | clean score 100/exit 0, defect score 96/exit 2; harness exit 0 |
| Lab 12 coverage/reports/cleanup | PASS; consumer removed and source hashes unchanged |
| git diff --check | PASS |

All previous gate/scenario assertions remain unchanged. The two dependency changes are the only runtime-resolution changes; no CLI source, test, workflow or package.json change is part of this remediation. Hosted Actions confirmation of this new lockfile is pending; cc408fb's earlier green runs do not validate uncommitted changes.

Additional bounded runtime checks passed: ordinary brace expansion API output; same-family IPv4 subnet membership; denial of cross-family IPv4/IPv6 subnet membership; Lighthouse's disabled telemetry gate returning before sampling; its enabled gate reaching sampling. The isolated diagnostic process used a sampling stub returning false, so it did not initialize the SDK or emit telemetry. It did not change any production file/configuration or suppress an audit finding. Evidence: targeted-runtime-checks.json.

Evidence directory: test-reports/dependency-security. before-all.json, before-production.json, after-all.json and after-production.json retain raw advisory data. inventory.json and paths.json retain all original installed versions, affected ranges, advisory URLs and production paths. validation-exits.json records tests=0, lab11=0, lab12=0; tests.log, lab11.log and lab12.log retain their actual output. The Lab 11 and Lab 12 scenario artifacts are also retained in their usual report directories.

## Recommended next actions

1. Review and push these two files only when authorized, then rerun all three hosted workflows. Do not label the release vulnerability-free: 11 high and 19 moderate package findings remain, with no development-only findings removed from scope.
2. Track an upstream braces fix or test a compatible replacement in a separate change. Do not waive the advisory merely because current patterns are trusted literals.
3. Decide whether to retain Node 20 support via an upstream supported Lighthouse 12 backport, or deliberately raise the minimum to >=22.19 for a Lighthouse 13 migration. Review score/TTFB/protocol changes, rerun audits and preserve regression semantics on the new version.
4. Define how patched transitive minimums will be enforced for distributed CLI consumers (reviewed shrinkwrap or upstream dependency-minimum updates) and maintain that policy with recurring audits. This lockfile alone does not enforce consumer upgrades. Avoid blanket forced-major overrides or direct dependencies added only to manipulate hoisting.

