# QA Check Cloud: repository assessment and implementation proposal

Date: 2 October 2026. Status: proposed; implementation requires approval.

This first deliverable is architecture and an MVP plan, not a SaaS implementation. No existing source, dependency, workflow, or npm publishing configuration is changed. Findings refer to the current working tree, including existing uncommitted doctor/autofix changes; they do not establish what is available in the published npm package.

## 1. Current repository

### Architecture and execution

The root package is an ESM Node.js CLI (`qa-check-cli`, package version 1.1.4), with strict TypeScript targeting ES2022/NodeNext. `bin/qa-check.js` imports `dist/index.js`; `src/index.ts` parses arguments manually and invokes `src/core/engine.ts`. Importing the package entry executes the CLI, so it is not currently a safe library entry point.

Execution is: load JSON config → detect project/framework → select pipeline → discover routes → adapt checks into a registry → execute checks sequentially → normalize results/issues → clean up runtime → calculate score → compare baseline → generate reports → write history → determine CI exit code.

`src/framework/context.ts`, `registry.ts`, `detect.ts`, and `detectors/*` identify framework, language, package manager, and build tool using files and dependency markers. Detection can resolve a nested project root. Broad framework detection does not imply equally deep testing: `src/pipeline/factory.ts` has dedicated mappings for Next.js, React, Vite, Vue/Nuxt, Angular, Astro, Laravel, WordPress, PHP, Flutter, Expo/React Native, Swift/SwiftUI, HTML/CSS frameworks, and Express. Other detections fall back to the generic pipeline, which runs TypeScript, ESLint, and code-quality insights.

`src/pipeline/base.ts` assembles reusable checks. `PipelineRuntime` caches routes, server startup, and a shared Playwright audit. `src/core/browser.ts` collects browser evidence with route concurrency two and five responsive viewports. Each route uses fresh contexts; authenticated session reuse is not implemented. Dynamic placeholders are excluded from browser scans. Lighthouse uses a separate Chrome launcher and samples route groups. Framework-specific native command checks exist, but they are not equivalent to full browser coverage.

### Commands and configuration

| Available in source | Behavior |
| --- | --- |
| `qa-check <path>` | Local scan; HTML, JSON, Markdown, PDF and history enabled by default |
| `qa-check help`, `--help`, `-h`, no arguments | Help |
| `qa-check init [path]` | Creates JSON config and workflow; skips existing files; not interactive |
| `qa-check doctor [path]` | Local environment diagnostics; uncommitted source |
| `qa-check fix [path]`, `autofix [path]` | Source modification with optional `--dry-run`; uncommitted source |

Scan flags include `--ci`, `--profile report|ci|strict`, report format toggles, `--output`, `--baseline`, `--no-baseline`, history controls, `--route`/`--include-route`, `--ignore-route`, `--max-routes`, `--min-score`, and `--fail-on`.

There are no implemented login/logout/whoami/upload, API-testing, E2E-flow, or visual-regression commands. `--mode dev|qa|ci` and TypeScript/YAML configs are not implemented. Despite the README installation example, `--version` has no dedicated handler in `src/index.ts`. Unknown flags are silently ignored and subsequent positional values can become the scan path.

`src/core/config.ts` reads only `qa-check.config.json`. Known fields are selectively normalized, invalid values are omitted, and malformed JSON warns then falls back to defaults. Precedence is defaults → config profile → config → CLI profile → CLI explicit options. Route inclusion is an explicit route list; ignore rules support prefixes/trailing wildcard. It is not a general include-glob expansion system. Config is loaded before framework detection may redirect the project root, which needs regression coverage.

### Checks, scores, reports, and CI

The Next.js pipeline includes Build, ESLint, TypeScript, Code Quality Insights, Route Discovery, SEO, Lighthouse, Accessibility, Responsive, Performance, Broken Links, Broken Images, Console Errors, and Network Errors. Other pipelines choose subsets or native checks. Code-quality insights are bounded heuristic scans, not AST analysis or functional tests.

Canonical types are `src/types/result.ts` and `src/types/issue.ts`. `AuditReport.version = 2` is a report schema version, not the npm CLI version. Check statuses are PASS, FAIL, WARNING, SKIPPED, ERROR. Issue severity is info/warning/error, and issue status currently represents check outcome rather than an issue-management lifecycle. Reports lack stable run/project/workspace IDs and git metadata.

`src/core/report.ts` orchestrates `src/reporters/{html,json,markdown,pdf}.ts`. Outputs are `index.html`, `report.json`, `report.md`, `report.pdf`, and screenshots. PDF uses PDFKit and failure is caught without discarding other formats. HTML has escaping and escapes `<` in embedded JSON; charts load Chart.js from an unpinned external CDN. Local HTML charts therefore are not fully offline. JUnit/CSV/Excel and hosted reports do not exist.

Overall score is the average of non-skipped checks, with SEO/Lighthouse/Accessibility/Performance counted twice; explicit scores override PASS=100/WARNING=60/other=0. History writes bounded compact snapshots under `reports/history`. Baseline comparison computes check-level status, score, and issue-count differences. It does not classify individual issues as new/existing/fixed/regressed.

`src/core/exitCode.ts`: minimum-score failure returns 3; FAIL/ERROR returns 2; warning threshold returns 1; success returns 0. Normal scans apply QA-derived exits only with `--ci`; operational failures still set exit 1. SKIPPED checks do not fail the gate. Report profile sets nonblocking defaults; explicit overrides still take precedence.

`.github/workflows/qa-check.yml` handles pushes, PRs, and dispatch, installs dependencies/browser, runs the published `qa-check-cli@latest`, captures the QA exit, writes a summary, posts/updates a PR comment, uploads artifacts, and then fails the job if required. It does not build or test this checkout's CLI implementation. PR permissions can prevent comments from forks. The init workflow is a second embedded template that can drift from the repository workflow.

### Dependencies and verification

Runtime: axe-core, chalk, chrome-launcher, execa, fast-glob, lighthouse, pdfkit, playwright, and @types/pdfkit. Development: @types/node, ts-node, typescript. Node requirement: >=20. No web framework, ORM, auth, payments, SDK, queue, or validation library is installed. Scripts are build/dev/start; no test or lint script is defined. No source test/spec suite was found.

Verification: installed local `tsc --noEmit` passes against the current source. Node reports v22.14.0. The PATH npm launcher fails because its referenced npm-cli.js is missing. No dependency installation, vulnerability audit, full browser scan, npm-package parity check, or cloud flow was executed. A passing typecheck is not evidence of runtime or security correctness. README says stable 1.1.3 while package.json says 1.1.4; published version was not verified.

### Reuse and actual blockers

Reuse detection, pipeline/check interfaces, shared browser audit, canonical result types, suggestions, reporters, score algorithm, profile/exit rules, local history, and baseline summary. Add cloud orchestration after local reporting; do not import SaaS dependencies into check implementations.

| Finding | Consequence / targeted action |
| --- | --- |
| `src/utils.ts` always prints command, cwd, stdout/stderr; JSON stores raw result data and errors contain stacks | Secrets/source/local paths may leave the machine. Add bounded, default-deny upload projection and redaction before cloud upload; stop unconditional debug logging |
| `normalize.ts` derives all item severities from aggregate check status; ERROR becomes info; some FAIL commands yield no normalized issue | Incorrect cloud counts and priorities. Preserve per-item severity, create command/error findings, keep skipped diagnostics separate |
| Fingerprints lowercase and strip characters, include line/location, omit viewport | Collisions and unstable history across file moves, line edits, hosts. Introduce versioned canonical cloud identity without silently changing old local baselines |
| Baseline/history counts sometimes inspect raw arrays rather than normalized issues | One cloud count definition is required; distinguish checks passed from assertions passed |
| Executor timeout races but does not cancel underlying work; browser exceptions become SKIPPED | False confidence and lingering work. Add cancellation and required-check coverage rules before production CI gates |
| Server readiness probes several ports; startup failure can leave child cleanup unresolved | Audit may hit an unrelated server. Track the selected port and child, clean up on startup failure; avoid starting a server solely for metadata |
| Engine report-generation guard excludes Markdown-only selection | Fix with a narrow regression test |
| Doctor marks browser PASS even when executable is missing | Diagnose actual browser availability accurately |
| No tests; duplicate legacy result types and wrappers | Establish fixtures and compatibility tests; consolidate only modules proven unused |
| Handwritten argument/config parsing silently accepts errors | Validate boundary inputs and reject unknown cloud commands/options |
| Autofix is textual and can remove calls with side effects or invent metadata | Keep separate from cloud upload; review patches and use parser-aware fixes before promoting as safe |

Local scans execute project scripts, which are trusted code on the user's machine. Never execute uploaded projects or arbitrary URLs on the SaaS web server. Existing screenshot capture has no sensitive-field masking. URL queries, console errors, source samples, and raw metadata can contain credentials; redaction cannot guarantee arbitrary screenshot privacy. Screenshot upload must be opt-in with capture masking and a clear data disclosure. No cloud authentication or tenant isolation exists yet; that is missing functionality, not a claim of an exploitable deployed service.

## 2. Proposed architecture

### Repository and deployment boundaries

Keep the root npm CLI layout and publishing allowlist for the MVP. Add a single `apps/web` Next.js application containing marketing, account pages, dashboard, and versioned route handlers. Do not add Express or move the working CLI into packages/cli now. Extract only new shared contracts and SDK as small independent packages. Add workspaces after package-resolution and tarball smoke tests demonstrate compatibility.

```text
bin/, src/, dist/              existing CLI; retain package name/bin
src/cloud/                    CLI auth orchestration and v2-report adapter
apps/web/src/app/              public pages, dashboard, api/v1 route handlers
apps/web/src/server/           auth, policy, services, data access, logging
apps/web/src/components/       accessible dashboard components
packages/contracts/src/       Zod schemas, API DTOs, error codes
packages/sdk/src/             transport, retry, token and upload interfaces
packages/db/prisma/            schema, migrations, seed
packages/db/src/               server-only Prisma access
packages/cloud-services/src/   shared storage, billing, usage, queue services
workers/cloud-worker/src/      import, comparison, cleanup, provider jobs
tests/                        unit, API integration, CLI compatibility, E2E
docs/cloud/                   architecture, contracts, operations
```

Dependency direction: CLI → SDK/contracts; web/worker → cloud services/db/contracts. Scanner → local report; upload adapter consumes the completed report. The SDK must not depend on Next.js, database, or Playwright. Share business services between web and worker, not web route handlers. Later extract packages/core/config and move CLI only if reuse warrants it.

### Frontend and backend

Use Next.js App Router, TypeScript, Tailwind, reusable accessible UI components, server-rendered lists, and client components only for interaction/charts. Routes: `/`, `/features`, `/pricing`, `/docs`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`; `/dashboard`, `/dashboard/projects`, `/dashboard/projects/[id]`, `/dashboard/test-runs`, `/dashboard/test-runs/[id]`, `/dashboard/issues`, `/dashboard/billing`, `/dashboard/settings`; `/cli/authorize` and private `/reports/[id]`.

Route handlers validate Zod DTOs and call server services; services enforce identity, membership, project scope, plan entitlement, and transactions. Middleware/layout redirects improve UX, but every data operation also checks authorization. This matches [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication). Use cursor pagination (default 25, maximum 100), server filters, explicit sort allowlists, bounded aggregates, private cache policies, and indexes. Include loading/empty/error states and keyboard navigation. API/E2E/visual/team pages arrive in later phases; do not display pretend working features.

### Authentication and CLI authorization

Proposed provider: Clerk for account registration, login, verification, password recovery, session revocation, and later Google/GitHub sign-in; keep membership/authorization in PostgreSQL and isolate provider integration behind `IdentityService`. This is a design choice, not a claim that provider setup is complete. Verify the chosen provider's current SDK, pricing, cookie configuration, and recovery behavior in milestone 2. Do not store passwords in the QA database. Verify provider webhooks; never allow client metadata to grant organization roles. Require CSRF/origin checks for cookie-authenticated mutations.

CLI login uses a device authorization flow, not password entry: request a short-lived device secret and user code → open the fixed HTTPS application URL → authenticate in browser → explicitly approve organization/project scope → CLI polls with server-defined interval → consume authorization once → receive short-lived access token and rotating refresh credential. Hash device secrets/refresh tokens, expire grants (proposed 10 minutes), rate-limit polling and user-code guesses, display requested scope, and require both authenticated approval and device-secret possession. Logout revokes refresh credential and clears local storage; token-family reuse revokes the family. Server validates credential status on every request so revocation is effective.

Store interactive credentials in OS credential storage behind a replaceable interface; do not silently fall back to an insecure plaintext file. Where unavailable, offer an explicitly documented restrictive-permission storage option. CI uses a narrowly scoped project token from `QA_CHECK_TOKEN`; project selected with `QA_CHECK_PROJECT_ID` or nonsecret config. CI never invokes browser login. Tokens are generated with cryptographic randomness, displayed once, hashed in DB, prefixed for identification, scoped, expiring, rotatable, revocable, and audited. Membership removal invalidates user access.

### Versioned cloud protocol

Introduce `RunUploadV1`, separate from local `AuditReport` v2. It carries `schemaVersion`, `clientRunId` (UUID), actual `cliVersion`, projectId, branch/commit/repository with credentials stripped, environment, framework, start/end ISO UTC times, durationMs, score/scoringVersion, normalized check outcomes, normalized issue observations, and coverage metadata. Optional categories remain absent rather than becoming zero. Server checks numeric bounds, timestamp order, finite values, bounded text/arrays, enums, and project scope. Unknown raw `data`, `source.raw`, stack traces, absolute paths, environment dumps, cookies, request bodies, and headers are not uploaded by default.

```http
POST /api/v1/runs
Authorization: Bearer <credential>
Idempotency-Key: <clientRunId>
Content-Type: application/json

{ "schemaVersion": 1, "clientRunId": "<uuid>", "projectId": "<uuid>",
  "cliVersion": "1.1.4", "environment": "development",
  "startedAt": "<ISO UTC>", "completedAt": "<ISO UTC>",
  "durationMs": 10000, "overallScore": 87, "scoringVersion": "local-v1",
  "checks": [], "issues": [], "coverage": { "routes": ["/"] } }

202 { "runId": "<uuid>", "processingStatus": "queued",
      "dashboardUrl": "https://qacheck.dev/dashboard/test-runs/<uuid>" }
```

Proposed limits: inline JSON <=2 MiB, <=100 checks, <=5,000 issues; negotiate larger imports later. Publish these in versioned contracts. Persist a sanitized report.json in private object storage before marking upload durable; coordinate staging, database reservation, and cleanup because S3 and PostgreSQL cannot share a transaction. In one DB transaction create queued run, quota reservation, staged object reference, and outbox event. Outbox dispatcher reliably enqueues import; return 202 only after durable acceptance. Idempotency unique per project/clientRunId plus payload hash; identical retry returns original run, different content returns 409. Recover orphaned staged objects and expired reservations.

Worker validates again, imports bounded batches, recomputes counts and validates scoring under the declared algorithm, writes observations, consumes usage reservation, and sets processing status complete atomically. Retain submitted score separately for compatibility; never label it independently verified website quality. Imported results are client-submitted evidence. Separate `processingStatus` from QA `outcome`; a processed run may fail QA. Worker errors surface sanitized actionable status and allow retry without double charging.

CLI writes local reports first, then uploads. Upload failure never rewrites them. Retry transient failures with bounded exponential backoff/jitter and the same idempotency key; honor Retry-After, never retry permission/validation errors blindly. QA exit stays authoritative; add opt-in `--upload-required` with a documented distinct failure code. `--upload` failure is visible but does not turn a locally passing gate into failure by default. Offline nonupload commands never contact cloud.

### Artifacts and reports

Artifact API issues short-lived upload grants bound to tenant/project/run, exact object key, allowed MIME, size, and checksum. CLI may only read explicitly generated artifacts within its report directory after realpath containment checks; no server-requested arbitrary filesystem paths. Completion verifies uploaded object metadata/checksum and reserves/consumes storage usage. PNG/JPEG/PDF/JSON only initially; default screenshots off for uploads. Store private bucket objects with server-generated keys. Downloads require authorization and short-lived signed URLs. Never accept client object keys as authority.

Render hosted reports from normalized data in the web app. Do not execute uploaded HTML on the app origin; serve any future HTML export from a separate sandboxed origin or as an attachment. MVP reports are organization-private. Secure-link sharing comes later with hashed random expiring/revocable share credentials. Artifact/run deletion is a tombstone plus an idempotent purge job, with explicit retention handling.

### Billing, usage, workers, and GitHub

Plans and quotas live in versioned database configuration; local CLI always free. Seed Free (zero cloud upload entitlement by default) and Pro (proposed INR 799/month); decide trial allowance as explicit configuration. Team/Enterprise are future plan configurations, not implemented promises. Currency amounts are integer minor units; quotas and entitlements never depend on a price comparison. Owners manage billing. A provider interface supports Razorpay initially and Stripe later. Backend creates checkout/subscriptions; browser checkout success is informational only.

Verify Razorpay signature against raw request bytes using HMAC-SHA256 and timing-safe comparison, deduplicate provider event IDs, durably queue processing, and reconcile out-of-order events with provider state. Update subscription/entitlements transactionally; handle failure, cancellation, renewal, expiry, upgrades, and downgrades with explicit effective dates. These requirements follow [Razorpay webhook documentation](https://razorpay.com/docs/webhooks/validate-test/). Use test mode first; document cancellation and grace-period policy.

Usage ledger records organization, metric, period, source ID, quantity, and reservation state. Enforce quotas transactionally under concurrency for projects, runs, seats, and storage, not with count-then-create. Deduplicate usage by source/metric. Quota downgrade prevents new usage without deleting existing data; retention policy is independent. Viewers cannot mutate; Developer/QA can upload/manage allowed project workflows; Admin manages projects/credentials; Owner controls billing, ownership, and destructive organization actions. Full invitations can wait; role enforcement cannot.

Redis/BullMQ worker starts with report ingestion, comparison, artifact cleanup, account email/provider events, and retention. Jobs carry IDs, not secrets/raw reports; use retries, bounded concurrency, poison-job handling, observability, and idempotent database transitions. [BullMQ recommends idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs). Use a transactional outbox because DB writes and queue writes are separate systems. [Prisma transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions) provide database atomicity; they do not make external effects atomic. Scheduled scans, browser execution, PDF/diff processing come later. Cloud scanning requires isolated ephemeral workers, controlled egress, resource limits, DNS/redirect SSRF checks, and secrets isolation; the import worker does not execute projects.

Reuse local GitHub Actions/PR summaries before adding a GitHub App. Pin the tested CLI version, build/test this repository separately, keep tokens out of fork PR workflows, and never run untrusted PR code with privileged cloud credentials. Later use verified GitHub App installation/webhook context for repository/PR identity; do not trust uploaded repository strings to choose a comment destination. Queue idempotent bot comments with sanitized aggregates and private report links.

## 3. Proposed PostgreSQL schema

All entities use UUID IDs unless a provider ID is separately recorded. Mutable entities have createdAt/updatedAt; immutable observations/events have createdAt. Foreign keys, tenant indexes, database check constraints, and explicit deletion policies are required. Timestamps are UTC; schedules separately retain IANA timezone.

| Model | Principal fields and constraints |
| --- | --- |
| User | authProviderSubject unique, email, displayName, deletedAt; provider owns credentials |
| Organization | name, slug unique, createdById, retentionDays, deletedAt |
| OrganizationMember | organizationId, userId, role; unique(org,user); index(user,org); cannot remove last owner |
| Project | organizationId, name, slug, description, repository, websiteUrl, framework, defaultBranch, environment, createdById, archivedAt; unique(org,slug); latestRunId nullable |
| ProjectToken | org/project, name, tokenPrefix, tokenHash unique, scopes, expiresAt, revokedAt, lastUsedAt, createdById |
| CliDeviceGrant | deviceSecretHash unique, userCodeHash unique, expiresAt, pollInterval, approval identity/scope, consumedAt |
| CliCredential | user/org, refreshHash unique, familyId, expiry/revocation, rotation lineage |
| TestRun | org/project, uploader user/token, clientRunId, payloadHash, schema/CLI/scoring versions, framework/environment/git fields, UTC start/end, durationMs, reported/validated score, processingStatus, outcome, coverage, reportArtifactId; unique(project,clientRunId) |
| TestResult | org/project/run, stable checkKey, name/category, outcome, nullable score, duration, counters, coverage; unique(run,checkKey); optional category scores derived from these records |
| Issue | org/project, fingerprintVersion, canonicalFingerprint, rule/category/title, lifecycleStatus, first/lastSeenRunId and timestamps; unique(project,fingerprintVersion,fingerprint) |
| IssueOccurrence | org/project/run/issue/result, severity, checkOutcome, route/file/line/selector, expected/actual/fix (bounded), changeClassification; unique(run,issue,locationKey) |
| Artifact | org/project/run, kind, server objectKey unique, mime, bytes, sha256, upload/deletion state; no binaries in DB |
| Plan | key/version unique, currency, amountMinor, billingInterval, entitlements, active |
| PlanLimit | planId, metric, limit, period; unique(plan,metric); explicit unlimited semantics |
| Subscription | org, provider, externalCustomerId, externalSubscriptionId unique per provider, planId, status, billing period, cancellation/effective dates; one effective entitlement source per org |
| Usage | org, metric, periodStart, sourceId, amount, reservation state; unique(org,metric,sourceId); usage counters locked transactionally |
| BillingEvent | provider, eventId, payloadHash, processing status, redacted metadata; unique(provider,eventId) |
| OutboxEvent | event type, aggregateId, version, payload refs, availableAt, publishedAt, attempts; unique aggregate event key |
| AuditLog | org, actor user/token, action, target IDs, requestId, redacted metadata, timestamp; append-only access |

Future additive migrations: Screenshot (Artifact FK + viewport/route), VisualBaseline (project/route/viewport/approval), VisualComparison (run/baseline/current/diff artifacts + ratio/threshold), ApiTestResult and E2ETestResult (TestResult detail records), Integration (org/provider/config + encrypted secret reference), Notification (trigger/provider/status/dedupe), Schedule (project/timezone/next execution), ProjectMember, Invitation, ReportShare. Avoid empty MVP tables with no behavior; these entities already have reserved boundaries.

Index run lists by `(organizationId, projectId, completedAt DESC, id)` and filtered environment/branch; issue lists by `(organizationId, projectId, lifecycleStatus, lastSeenAt, id)`; occurrences by `(runId, category/severity)` through result joins or justified indexed columns; token lookups by hash; usage by `(organizationId, metric, periodStart)`; outbox by unpublished/availableAt. Carry org/project together through composite parent keys/FKs so a child cannot reference another tenant's run or project. All service queries scope by verified membership/token tenant, including aggregates and signed downloads. Validate PostgreSQL row-level-security defense in depth separately if introduced; do not assume an ORM supplies tenant isolation.

Comparison chooses previous completed run in the same project/environment/branch and compatible scoring/fingerprint/coverage versions. First run is explicitly a baseline. New=never observed; existing=present previously; fixed=absent after successful comparable coverage; regressed=previously fixed and reappears. Missing/skipped/excluded coverage is unknown, never automatically fixed. Maintain issue lifecycle separately from immutable occurrence classification; preserve ignored/accepted decisions. Normalize origin-relative routes and relative source locations with a versioned digest; preserve case-sensitive paths and viewport distinctions. Serialize comparison per stream and deterministically handle delayed/out-of-order uploads.

## 4. API surface and security contract

Auth provider owns its login/recovery endpoints; QA's versioned endpoints below own application authorization. All APIs return structured errors `{error:{code,message,requestId,details?}}` without secrets/stacks. Use 401 unauthenticated, 403 forbidden/entitlement, 404 inaccessible resource, 409 conflict, 413 oversized, 422 invalid payload, 429 rate limit/quota with explicit code, and 5xx sanitized operational failure. Generate request IDs server-side. Zod schemas reject unknown privileged fields. Cursor tokens are scoped to filters/tenant and limits are bounded.

| Endpoint family | Contract |
| --- | --- |
| `GET /api/v1/me` | Identity and permitted org/project scopes; never tokens |
| `POST /api/v1/organizations` | Authenticated workspace creation; owner membership in same transaction |
| `GET /api/v1/organizations/:id` | Workspace settings; verified membership |
| `POST /api/v1/cli/device`, `/cli/token` | Device initiation/poll; rate-limited public grant protocol |
| `POST /api/v1/cli/authorize`, `/cli/refresh`, `/cli/revoke` | Browser approval, refresh rotation, revocation; correct respective credential type |
| `GET/POST /api/v1/projects` | Org-scoped pagination/create, quota enforced |
| `GET/PATCH/DELETE /api/v1/projects/:id` | Read/edit/archive; role checked; hard deletion queued later |
| `POST /api/v1/projects/:id/tokens` | Create scoped expiring token, return plaintext once |
| `GET /api/v1/projects/:id/tokens` | Metadata only |
| `DELETE /api/v1/projects/:id/tokens/:tokenId` | Revoke; rotation creates replacement then revokes predecessor |
| `POST /api/v1/runs`; `GET /api/v1/runs[/:id]` | Durable idempotent import; scoped filtered lists/detail/status |
| `DELETE /api/v1/runs/:id` | Authorized tombstone and artifact purge |
| `GET /api/v1/runs/:id/comparison` | Compatible previous/current deltas and issue classifications |
| `GET /api/v1/issues`; `PATCH /api/v1/issues/:id` | Filters and lifecycle updates, audit trail |
| `POST /api/v1/artifacts/upload`; `POST /api/v1/artifacts/:id/complete` | Presign/reservation and verified completion |
| `GET /api/v1/artifacts/:id/download` | Authorized short-lived download |
| `GET /api/v1/billing/plans`, `/billing/subscription`, `/usage` | Public safe pricing; scoped subscription and usage |
| `POST /api/v1/billing/checkout`, `/billing/cancel` | Owner-only provider operations |
| `POST /api/v1/billing/webhooks/razorpay` | Raw-body signature, dedupe, durable processing; no session required |
| Later `/api/v1/integrations/github/*` | Installation authorization and verified event handling |

Use TLS, secure session cookies per provider, origin/CSRF checks, restricted CORS, CSP and other secure headers, parameterized Prisma queries, distributed rate limits by identity/IP/token, passwordless report URLs only after explicit share creation, and private storage. Redact both in CLI projection and server boundary using allowlisted DTOs, URL query filtering, common secret patterns/header names, bounded messages, and seeded-secret tests. Log IDs/timing/status, not request bodies, tokens, presigned URLs or cookies. Encrypt provider secrets with managed keys. Do not promise perfect arbitrary-data secret detection. Limit payload depth/count/bytes and validate artifacts independently from filenames. Sensitive actions produce redacted audit events. Restore/backups and deletion semantics are production gates.

## 5. Implementation milestones

Each milestone is a small reviewable series of changes. End-to-end upload loop is the gate before advanced testing. No npm publication or production deployment is implicit in this proposal.

### 1 — Foundation and compatibility

- Goal: freeze current free behavior and establish cloud boundaries without moving the CLI.
- Files/modules: root package/tsconfig scripts as needed; `tests/cli`, `tests/fixtures`; `apps/web` scaffold; `packages/contracts`, `packages/db`; `.env.example`, local service compose, CI; `docs/cloud/contracts.md`.
- Database: initial User/Organization/Member/Project migration skeleton, FK conventions; reproducible dev seed without secrets.
- APIs: health/readiness only, initial DTO/error/pagination schemas.
- Pages: marketing layout and landing/features/docs skeleton with honest content.
- CLI: fix unknown flag/version handling and isolated report-generation issues with compatibility tests; no cloud required.
- Tests: source typecheck, root tarball/bin smoke, offline scan fixtures, profile precedence and exit codes, current-v2 report adapter fixtures; Windows/Linux checks.
- Done: existing local usage/report formats preserved, cloud env unnecessary for CLI, clean install/build verified, no publish side effects. Resolve local npm launcher for development without changing system tools blindly.

### 2 — Authentication and workspace isolation

- Goal: verified account lifecycle and strict tenant policy.
- Files/modules: `apps/web/src/server/auth`, `policy`, provider adapter; account pages; DB auth identity sync and audit service.
- Database: finalize User/Organization/OrganizationMember/AuditLog; unique identity/membership constraints; provider webhook dedupe.
- APIs: `/me`, org create/read, provider session/webhook endpoints; input/rate/origin protection.
- Pages: register/login/logout, verification, forgot/reset, protected dashboard/settings.
- CLI: none.
- Tests: account recovery/session revocation E2E; tenant A cannot list/read/mutate tenant B; forged role metadata; CSRF; provider webhook replay.
- Done: account flow works in provider test/staging setup; browser and API access both protected; owner membership atomic; session logout/revocation effective.

### 3 — Projects, scoped credentials, and quota primitives

- Goal: private project CRUD and server-authorized credential lifecycle.
- Files/modules: project/token/usage services, policy matrix, reusable forms/lists.
- Database: Project/ProjectToken, Plan/PlanLimit, Usage reservations; archive constraints and indexes.
- APIs: project list/create/read/edit/archive; token create/list/revoke; usage read.
- Pages: projects list/new/detail/settings, one-time token display.
- CLI: document `QA_CHECK_TOKEN` and project selection contract; no upload yet.
- Tests: all role permissions, token expiry/revoke/scope, secret-free listings/logs, concurrent project quota, paginated filtering.
- Done: another tenant/token cannot access project, secret displayed once, rotation documented, quota enforced under concurrency.

### 4 — CLI cloud authentication

- Goal: browser-approved CLI identity and CI credentials.
- Files/modules: `src/cloud/auth`, `src/cloud/credentials`, `packages/sdk` auth transport; login/logout/whoami dispatch/help; `/cli/authorize`.
- Database: CliDeviceGrant/CliCredential with hashes, expiry, rotation lineage.
- APIs: device initiation/poll/authorize/refresh/revoke; `/me` credential support.
- Pages: approval screen showing organization/project scope, expiry and success state.
- CLI: `login`, `logout`, `whoami`; fixed trusted cloud origin; timeout/interrupt cleanup; noninteractive CI behavior.
- Tests: approval → poll → whoami → logout E2E; grant replay/guess/expiry; refresh reuse; missing keychain; CI noninteractive; token redaction.
- Done: no CLI password entry, approved scope only, credentials protected, revocation and rotation work, local commands remain offline.

### 5 — Durable result upload and private artifacts

- Goal: complete local report → authenticated cloud persistence loop.
- Files/modules: `src/cloud/upload`, v2-to-v1 adapter/redactor; run/artifact services; storage adapter; outbox dispatcher; `workers/cloud-worker` importer.
- Database: TestRun/TestResult/Issue/IssueOccurrence/Artifact/OutboxEvent and quota reservation/dedupe constraints.
- APIs: POST/GET runs, artifact presign/complete/download, run status/delete.
- Pages: processing/error states and minimal run details sufficient to verify imported score/issues.
- CLI: `--upload`, project resolution, metadata capture, bounded retries, optional `--upload-required`; local reports completed before networking.
- Tests: CLI-to-API integration; retry produces one run/charge; conflicting payload 409; payload size/schema; cross-tenant artifacts; injected secrets; DB/storage/Redis failure and outbox recovery; report bytes survive upload failure.
- Done: upload accepted durably, worker populates dashboard data, private sanitized report.json stored, quotas enforce concurrent uploads, screenshot uploads opt-in, no execution of submitted code.

### 6 — Dashboard and hosted private reports

- Goal: usable MVP navigation, aggregate quality visibility, and issue triage.
- Files/modules: overview/projects/runs/issues server queries; UI tables/charts/filter components; report renderer.
- Database: list/aggregate indexes; issue lifecycle audit support; no unnecessary denormalization.
- APIs: filtered cursor lists, run detail, overview aggregates, issue PATCH, private report reads.
- Pages: overview with projects/runs/open issues/average score, project detail, run list/detail, issues, settings, private reports.
- CLI: update docs/help to link returned dashboard URL.
- Tests: dashboard E2E from real imported fixtures; filter/pagination isolation; nullable categories; keyboard/accessibility; empty/loading/error states; stored XSS payloads render as text.
- Done: account → project → CLI → run displayed with truthful check/issue counts, fast scoped queries, responsive readable interface and private downloads.

### 7 — History and issue comparison

- Goal: prove repeat-upload improvement loop.
- Files/modules: cloud fingerprint adapter, stream comparison service/job; delta charts/issue filters; local summary adapter retained.
- Database: fingerprintVersion/scoringVersion/coverage, unique issue identity, change classifications and comparison stream ordering.
- APIs: run comparison and project history endpoints.
- Pages: score trends, previous/current delta, new/existing/fixed/regressed issues.
- CLI: send comparable coverage/metadata without changing old reports destructively.
- Tests: two/three-run sequences; reappearance; skipped/removed route never falsely fixed; viewport/case/line identity; duplicate and out-of-order imports; incompatible score versions.
- Done: example 87→94 and +7 displays correctly; issue lifecycle reproducible and scoped to branch/environment/coverage; all required MVP loop steps work before phase 2.

### 8 — Razorpay billing and entitlements

- Goal: configurable Free/Pro with trustworthy subscription lifecycle.
- Files/modules: billing provider interface/Razorpay adapter, plan config/seed, webhook worker/reconciler, entitlement service.
- Database: Subscription/BillingEvent, provider mappings, usage period and effective entitlement constraints.
- APIs: pricing/subscription/checkout/cancel, signed webhook, usage.
- Pages: pricing and dashboard billing, payment pending/failure, usage and cancellation states.
- CLI: actionable quota/entitlement errors; free checks unchanged.
- Tests: test-mode paid journey, forged checkout state, raw-body signature, duplicate/out-of-order events, renewal/failure/cancel/expiry/upgrade/downgrade, quota races and no double charges.
- Done: only verified provider state grants paid access, prices/limits configurable, cancellation/grace policy documented, existing data retained on downgrade. Live activation is a separate approved operational step.

### 9 — GitHub MVP integration

- Goal: trusted CI upload and useful sanitized PR summaries using existing workflow.
- Files/modules: repository workflow plus init template; pinned CLI installation; shared sanitized summary formatter; GitHub integration docs. Full App bot deferred to phase 4.
- Database: optional verified integration mapping only if installation flow is introduced; no repository authority from client strings.
- APIs: reuse runs; App/webhook routes only if added in a separately scoped increment.
- Pages: connection/setup instructions and uploaded CI metadata on run detail.
- CLI: CI metadata adapter, documented token/project envs, deterministic upload/gate behavior.
- Tests: same-repo CI upload; fork PR receives no secrets; PR text injection/redaction; preserves QA exit after report upload; pins and template parity; unauthorized comment targets denied.
- Done: CI reports upload when authorized, PR summary links private report without sensitive values, fork-safe behavior documented, checkout source has independent build/tests.

### 10 — Production hardening and release readiness

- Goal: production candidate with evidence, operations, and a clear approval gate.
- Files/modules: rate limits/secure headers, logs/metrics/tracing, environment validation, retention/purge jobs, deployment/runbooks, backup/restore tests; README, CONTRIBUTING, CHANGELOG, SECURITY and docs.
- Database: verified migration rollout/rollback strategy, deletion/retention indexes, auditable reconciliation.
- APIs: complete negative authorization matrix, limits, stable errors/request IDs, webhook and upload abuse defenses.
- Pages: final onboarding, accessible/error states, account deletion/session management, honest pricing/data disclosure.
- CLI: package tarball validation, supported Node/OS coverage, upload compatibility fixtures, required-check CI coverage and cancellation fixes.
- Tests: critical journey E2E, API integration on real PostgreSQL, worker retry/kill recovery, concurrent quotas, backup restore, load/performance budget, dependency/security review, secret fixtures and tenant isolation for every route.
- Done: register → project → login → upload twice → compare → subscribe/cancel works in staging; outage/deletion/restore rehearsed; no secrets in reports/logs; no automatic npm release or production deployment.

## 6. Later phases and approval boundary

Phase 2: API tests, authenticated scanning, TypeScript config with validated boundary and documented code-execution implications, route patterns, JUnit, improved CI summaries. Phase 3: Playwright flows/forms/visual baselines and review. Phase 4: GitHub App bot, notifications, team invitations/approvals, optional AI suggestions. Schedule browser scans only after isolated worker execution and abuse controls exist. Avoid charging for capabilities that are merely roadmap pages.

Documentation rollout: foundation adds installation/getting-started/cloud design; authentication and CLI milestones add command/API/credential docs; GitHub milestone adds CI/GitHub docs; advanced API/E2E/visual docs arrive with implementations and explicitly mark unavailable features meanwhile. Every milestone updates CHANGELOG and relevant docs; SECURITY describes private reporting and vulnerability reporting without inventing a contact address.

Recommended approval scope: milestone 1 only, followed by review of compatibility evidence and foundation contracts before authentication integration. This proposal deliberately leaves the working root CLI in place and defers package relocation. Large architectural changes are paused because the supplied request explicitly requires approval after this first assessment; no implementation approval is inferred from this document.
