# Step 4 — basic project management verification

Date: 28 October 2026. Branch: platform-branch. No commit, merge, push, or published QA Check CLI change.

## Implemented

- Project and ProjectStatus Prisma models with UUIDs, creator relation, timestamps, ACTIVE/ARCHIVED status, unique normalized name key, and list/creator indexes.
- Existing session and role middleware reused. All signed-in users can view active projects; ADMIN/DEVELOPER can create and edit; QA is read-only; only ADMIN can archive, restore and explicitly retrieve archived records.
- Six project APIs with strict Zod body/query/UUID validation, safe display-name-only creator responses, pagination/search, atomic active-only edits and safe duplicate/missing/conflict errors.
- Responsive project list, create form, details and edit mode, archive confirmation and restore actions. Working search/status filters, pagination, empty/loading/error/not-found states and inline form errors.
- Shared workspace shell extracted from the existing dashboard layout with Projects navigation for all roles. Existing dashboard design and role redirects preserved. Session revalidation no longer redirects project pages back to dashboards.
- HTTP-only same-origin cookie proxy extended to projects. POST/PATCH origin/content-type protection and PATCH CORS support added. No new dependencies.

## Permission boundary

This is a temporary single workspace. All active projects are visible to all authenticated users, and developers can edit any active project. This MUST become organization-scoped authorization before onboarding independent companies. No organizations, memberships, invitations, CLI integration, scans, defects, billing or repository synchronization were added.

Names are trimmed and unique case-insensitively across the workspace, including archived projects. nameKey is internal and never returned. Creation and update cannot accept status or creator identity. Repository links use HTTP/HTTPS without embedded credentials and are not fetched by the backend.

## Actual verification

- Before changes: regular PostgreSQL connection passed; 4 existing authentication/role suites passed with no failures or skips.
- Prisma validation, client generation and migration deployment passed on regular PostgreSQL. Migration: 20261028010000_projects. Existing migrations were preserved.
- Migration preservation: exact equality of 3 user records (roles, password hashes, creation/update timestamps) and 2 complete session records, including one temporary fixture. A pre-migration QA cookie still authenticated after migration.
- Final database-backed automated run: 5 passed, 0 failed, 0 skipped. Covers authentication regression, local role-command guards, full role/dashboard matrix, project role permissions, valid creation/editing, optional-field clearing, duplicate names/renames, forged fields, invalid URLs, UUIDs/missing IDs, archived edit protection, archive/restore, archived visibility, search/pagination and origin protection.
- Both TypeScript checks passed. Both production builds passed.
- Existing role-dashboard browser regression passed for ADMIN, DEVELOPER and QA, including public registration, login redirects, cross-role redirects and logout.
- Project browser flow passed: ADMIN create/edit, archive confirmation/cancel, archive/restore and explicit archived listing; DEVELOPER create/edit, search, pagination and no-match state; QA read-only UI, create/edit denial, invalid/archived ID not-found handling, and logout.
- Project list, create form and details passed overflow checks at widths 1440, 900, 768 and 390. Desktop/mobile screenshots were visually inspected in scratch/step4-projects-desktop.png and scratch/step4-projects-mobile.png.
- Initial failures were corrected: a mixed-case email in a test fixture, a missing role-label variable after layout extraction, and browser harness timing/assertions for hidden dialogs and hydration after native search navigation.
- Production-mode project browser/runtime verification passed for all roles, with zero uncaught client or hydration errors. A deliberate API outage also rendered the safe Workspace unavailable screen and retry action. Both development servers were restored afterward.

## Endpoints and pages

API base: http://localhost:4000/api/v1

- GET /projects (page=1, limit=12 up to 50, q=name/framework search, status=ACTIVE by default)
- POST /projects
- GET /projects/:id
- PATCH /projects/:id
- PATCH /projects/:id/archive
- PATCH /projects/:id/restore

Only ADMIN can use status=ARCHIVED on the list or includeArchived=true on details. Ordinary detail requests hide archived projects with 404. Mutations use the configured frontend Origin and application/json; status actions accept {}.

Frontend:

- http://localhost:3000/projects
- http://localhost:3000/projects/new
- http://localhost:3000/projects/<project-id>
- Edit: http://localhost:3000/projects/<project-id>?edit=1
- Archived admin details: http://localhost:3000/projects/<project-id>?archived=1

## Files created in Step 4

- apps/api/prisma/migrations/20261028010000_projects/migration.sql
- apps/api/src/projects.ts
- apps/api/tests/projects.test.ts
- apps/web/app/components/workspace-shell.tsx
- apps/web/app/error.tsx
- apps/web/app/projects/types.ts
- apps/web/app/projects/layout.tsx
- apps/web/app/projects/page.tsx
- apps/web/app/projects/new/page.tsx
- apps/web/app/projects/[id]/page.tsx
- apps/web/app/projects/project-card.tsx
- apps/web/app/projects/project-form.tsx
- apps/web/app/projects/project-actions.tsx
- apps/web/app/projects/loading.tsx
- apps/web/app/projects/error.tsx
- apps/web/app/projects/not-found.tsx
- PROJECT_VERIFICATION.md

## Files modified relative to completed Step 3

- apps/api/prisma/schema.prisma
- apps/api/src/app.ts
- apps/api/src/authorization.ts
- apps/web/next.config.ts
- apps/web/app/dashboard/dashboard-view.tsx
- apps/web/app/dashboard/logout-button.tsx
- apps/web/app/globals.css
- README.md

Existing uncommitted Step 1–3 work was preserved. Environment files and generated clients remain ignored. Test accounts/projects are cleaned up by their harnesses. The temporary migration fixture is removed after verification.

Inherited local setup limitation: PostgreSQL is started manually; automatic Windows service startup remains unconfigured.

Suggested commit: feat(platform): implement role-based project management

Stopped after Step 4; Step 5 not started.
