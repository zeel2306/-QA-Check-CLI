# QA Check Platform — Step 1

Standalone npm-workspaces application. The parent repository is the existing CLI; its code and package files are unchanged. Run all commands below from this folder, not the parent CLI folder.

## Prerequisites

- Node.js 22.12+ (Node.js 24 LTS recommended) and npm 10+.
- PostgreSQL installed locally only if you want to verify database access.
- Two Windows PowerShell terminals for development.

## Installation (Windows PowerShell)

```powershell
Set-Location C:\Users\monil\qa-check\qa-check-platform
node --version
npm.cmd --version
npm.cmd ci
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/api/.env.example apps/api/.env
```

Copy environment examples once; preserve your edited files on later installs. Using npm.cmd avoids PowerShell script execution-policy restrictions.

Edit `apps/api/.env` with your PostgreSQL username, password, host, port and existing database name. Percent-encode special characters in URL credentials. No application tables or migrations are needed in Step 1. If creating a local database with PostgreSQL's SQL Shell, run:

```sql
CREATE DATABASE qa_check_platform;
```

The example credentials are placeholders. PostgreSQL is not required to run the homepage or health endpoint.

## Development

Terminal 1:

```powershell
Set-Location C:\Users\monil\qa-check\qa-check-platform
npm.cmd run dev:web
```

Terminal 2:

```powershell
Set-Location C:\Users\monil\qa-check\qa-check-platform
npm.cmd run dev:api
```

Open http://localhost:3000. The API uses http://localhost:4000. Stop either server with Ctrl+C.

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

Expected JSON: `{"status":"ok","service":"qa-check-platform-api"}`. This endpoint confirms the HTTP server only; it does not check PostgreSQL.

## Validation and production startup

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:validate
npm.cmd run db:check
```

`db:check` runs a read-only `SELECT 1` against DATABASE_URL and exits nonzero on failure. It creates no tables. A running PostgreSQL service alone does not verify credentials or database access.

After building, run `npm.cmd run start:web` and `npm.cmd run start:api` in separate terminals.

## Structure and configuration

- `apps/web/app`: App Router homepage, root layout and Tailwind CSS 4 styles.
- `apps/web/.env.example`: optional public API origin reserved for future requests; the current homepage does not call the API.
- `apps/api/src/server.ts`: Express HTTP server; PORT defaults to 4000.
- `apps/api/src/check-db.ts`: explicit PostgreSQL connection check.
- `apps/api/prisma.config.ts`: Prisma 7 connection URL and schema configuration.
- `apps/api/prisma/schema.prisma`: PostgreSQL datasource and modern client generator; no models.
- `package-lock.json`: exact dependency resolution; commit it and use npm ci.

Prisma 7 uses the URL in prisma.config.ts and the PostgreSQL driver adapter at runtime. The adapter and client packages are installed for ORM setup. No application client is generated or instantiated yet because there are no models or database-backed features. Add models, generate the client and wire the adapter only in an approved later step. Do not run migrations or db push for this empty foundation.

References: [Prisma PostgreSQL configuration](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

No authentication, dashboards, project management, CLI integration, paid services or external integrations are included.

## Verification performed

- npm install completed; npm audit reported zero known vulnerabilities at installation time.
- Both workspace TypeScript checks passed.
- Next.js production build and Express TypeScript build passed.
- GET /api/health returned HTTP 200 and the expected JSON.
- Production homepage returned HTTP 200 and contained the required title and tagline.
- Prisma schema validation passed with no models or tables.
- Local PostgreSQL 18 was running, but db:check failed because it rejected the example postgres password. Database access is NOT verified. Update apps/api/.env with valid credentials and rerun npm.cmd run db:check.

Port 3000 was already occupied on the validation machine. To use another frontend port:

```powershell
npm.cmd run dev --workspace=@qa-check-platform/web -- --port 3100
# Or, after building:
npm.cmd run start --workspace=@qa-check-platform/web -- --port 3100
```

For a different API port, edit PORT in apps/api/.env.
