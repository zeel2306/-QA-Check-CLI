# QA Check Cloud

A separate Next.js + TypeScript + Tailwind application alongside the existing CLI. The root CLI is untouched. This is a working local UI and SaaS foundation, **not a production-certified SaaS**.

## See the output

```powershell
cd apps/web
npm install
npm run db:generate
npm run dev
```

Open http://localhost:3000/demo for the interactive sample dashboard or http://localhost:3000 for the public website. Sample projects, issues and visual approvals change only in the current browser session. Demo tokens cannot authenticate. Real `/dashboard` routes never fall back to sample data and require Clerk.

## Real workspace setup

1. Copy `.env.example` to `.env.local` (ignored by Git). Set `APP_URL` to the exact origin used in the browser. Do not commit credentials.
2. Configure a Clerk application and both keys. Enable email/password signup, email verification and password reset in Clerk; optionally enable GitHub/Google. Clerk owns password/session security. `/account` provides account and session management. Restart Next.js after changing keys.
3. Start PostgreSQL. Optional local services: `docker compose up -d`. The compose credentials are for loopback development only.
4. Prisma/tsx do not automatically load `.env.local`: export `DATABASE_URL` in the shell or use Node's `--env-file` for worker/seed commands. Run `npm run db:migrate`, then `npm run db:seed`.
5. Configure private S3-compatible storage and create the bucket privately. Optional MinIO console: http://localhost:9001. Set endpoint/region/bucket/access keys. No public bucket policies. Screenshots are not uploaded yet.
6. `npm run worker` processes persisted imports separately from HTTP requests. Supply the same `DATABASE_URL` as the web app. Five failed import attempts leave a visible FAILED run status in the API; the web app currently lists completed runs only.
7. Register/login, create a project, generate a token and upload an existing report through the example on `/docs`. Login/--upload CLI commands are not implemented by this task. The web UI cannot execute scans. Existing local usage continues to work.

The seeded Free cloud allowance is one project/five runs per UTC month; Pro is ten projects/1,000 runs. Prices and quotas are database configuration. These cloud limits do not apply to local CLI scans.

## Payments

Use Razorpay **test mode** initially. Create a provider plan matching your configured price, set `RAZORPAY_PRO_PLAN_ID`, and seed again. Supply the provider keys and webhook secret. Configure `/api/v1/billing/webhooks/razorpay` for subscription lifecycle events. Owner-only checkout creates a pending subscription; only a signed webhook and independently retrieved provider state updates entitlements. Raw-body HMAC verification, event deduplication and provider-state reconciliation are implemented. Billing remains unverified without test account credentials. Stripe is an architectural extension point, not an implemented provider.

## API

`/api/v1/health`; authenticated `/me`, `/projects`, `/projects/:id`, `/projects/:id/tokens`, `/projects/:id/tokens/:tokenId`, `/runs`, `/runs/:id`, `/runs/:id/download`, `/issues`, `/issues/:id`, `/usage`, `/billing/plans`, `/billing/subscription`, `/billing/checkout`, `/billing/cancel`. Run uploads accept project-scoped bearer tokens. Other endpoints use authenticated sessions and server-side roles; cookie mutations require the configured Origin. Project archival revokes its tokens. Token expiry is 90 days; only hashes stored. Generate a replacement, update CI, then revoke the old token to rotate.

Uploads accept <=2 MiB, 100 checks, <=500 issues per check, report schema 2. Reports are projected to an allowlist and pattern-redacted on the server before private JSON storage; exclude raw logs/stacks/source/request headers. Do not rely on regex to remove every possible secret. Retries reuse project/clientRunId and deduplicate payload/usage. Uploads persist a DB import job and return 202; a PostgreSQL-backed worker leases/retries imports. This avoids adding Redis before it is necessary. Worker processing and run results are committed transactionally.

Dashboard datasets are bounded to 100 projects/runs and 200 issues with local filters/pagination; APIs provide cursor pagination for larger lists. Full server-backed UI pagination, historic stream rebuilds for delayed uploads, verified scoring, storage quotas, orphan cleanup, retention, email notifications, team invitations, all advanced test ingestion, hosted HTML/PDF/JUnit artifacts, and shared report links remain follow-up work. Comparison preserves unknown/skipped coverage rather than resolving those issues, but requires further integration testing for mixed branches and delayed uploads before production use. Quality gates are stored; cloud gate enforcement is not implemented yet.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

Tests cover token randomness/hashing, webhook integrity, schema boundaries, report redaction, request limits, CSRF origin checks, secret-free errors, and auth fail-closed behavior. Real Clerk/PostgreSQL/S3/Razorpay flows require credentials and integration verification; these tests do not establish production readiness.

## Deployment

Run Next.js in a Node environment with PostgreSQL, private object storage, and a separate worker. Use TLS, secure service credentials, database backups, provider configuration, monitoring and integration tests before production. No npm package was published and no external deployment was performed.
