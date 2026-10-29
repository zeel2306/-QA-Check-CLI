# Public website merge guide

Reviewed 2026-10-29 on `feature/platform-office-work`. No files were staged, committed, pushed, or merged.

## Scope and Git baseline

- Public website implementation: `qa-check-platform/apps/web` (npm workspace `@qa-check-platform/web`). Do not confuse it with the separate repository-root `apps/web` application.
- Features: responsive SaaS landing page, nine documentation pages, local documentation search, troubleshooting, FAQ deep links/disclosures, error reference, light/dark documentation themes, accessible navigation, copy controls, and a validated PowerShell CLI Command Builder with four presets.
- Before this guide: 28 changed files = 2 tracked modifications + 26 untracked additions. Including this guide: **29 changed files**, 0 staged, 2 tracked modifications, 27 untracked additions.
- HEAD is `e0d78524` (`platform setup`). Against cached `origin/main`, the branch already contains that one setup commit adding 21 files, including API/Prisma scaffolding. A whole-branch merge therefore includes more than the uncommitted public frontend. Cached upstream tracking is 0 ahead/0 behind; no fetch was performed.
- No accidental working-tree changes outside the public frontend were found. This guide is the only file added during release preparation. Existing root `apps/web` functionality was inspected read-only, not run or certified.

## Routes

`/` replaces the scaffold homepage. Added documentation URLs:

`/docs`, `/docs/installation`, `/docs/commands`, `/docs/reports`, `/docs/platform`, `/docs/troubleshooting`, `/docs/faq`, `/docs/errors`, `/docs/command-builder`.

The docs slug route is statically generated with `dynamicParams = false`; unknown slugs return 404. When adding future guides, update both content and navigation/search data.

## File inventory

Paths below are relative to `qa-check-platform/apps/web` unless stated otherwise.

Modified tracked files:

- `app/page.tsx`: delegates to the server-rendered landing component.
- `app/layout.tsx`: reuses the text-only public metadata helper; retains the existing document structure and global stylesheet import.

Added files:

```text
app/docs/page.tsx
app/docs/layout.tsx
app/docs/[slug]/page.tsx
components/public-metadata.ts
components/landing/{landing-page.tsx,landing.module.css,copy-command.tsx}
components/docs/{clipboard.ts,code-block.tsx,content.tsx,doc-article.tsx}
components/docs/{docs-shell.tsx,docs.module.css,navigation.ts,search.ts,types.ts}
components/docs/{support-content.tsx,troubleshooting-data.ts,error-data.ts}
components/docs/{faq-data.ts,faq-group.tsx}
components/docs/command-builder/{command-builder.tsx,builder.module.css}
components/docs/command-builder/{generate.ts,metadata.ts,generate.test.ts}
```

Also added at repository root: `PUBLIC_WEBSITE_MERGE_GUIDE.md`. Existing `globals.css`, package files, lockfiles, environment configuration, backend, Prisma, and CLI source were not changed by public website development.

## Dependencies and exclusions

No additional dependencies or upgrades are required. Use the existing platform lockfile: Next.js 16.4.3, React/React DOM 19.3.1, TypeScript 5.9, Tailwind CSS/PostCSS 4.1. The tests use Node's test runner and the existing hoisted `tsx` development dependency declared by the API workspace. Verification used Node 24.22.1 and PowerShell 7; CLI documentation requires Node >=22.19.

Do not include real `.env` files, credentials, `node_modules`, `.next`, `dist`, `*.tsbuildinfo`, logs, reports, or temporary screenshots in the commit. Ignore rules were checked and nothing is staged. Existing tracked `.env.example` files contain setup examples and should remain intact. Credential-shaped strings in generator tests are intentional rejection fixtures, not real secrets. Prior QA reports live outside the repository under the Codex visualizations directory.

## Integration risks and recommended resolution

| Area | Risk and resolution |
| --- | --- |
| Application/deployment root | Both `qa-check-platform/apps/web` and `apps/web` exist. Select the intended deployed app before integrating. Copying files into the nested workspace does not update the other app's deployed website. Keep one App Router tree per chosen Next.js application; do not blindly combine `app/` and `src/app/`. |
| `/` and `/docs` | The root `apps/web/src/app` already owns these routes. Deliberately select/compose the public landing and docs implementation; do not blindly keep both route definitions. Preserve intentional existing documentation anchors such as `#upload` and `#ci` or provide an approved replacement when integrating. |
| Authentication/shared layout | The other root layout conditionally wraps content in `ClerkProvider` and defines metadata/icons. Preserve its provider and document structure. Apply public metadata at the appropriate page/layout level; do not overwrite the authenticated app layout with this workspace's simpler layout. Preserve existing `src/proxy.ts` and security headers. Verify public pages remain accessible and protected pages remain protected. |
| Dashboard/projects/history | No public change modifies these routes. Preserve existing navigation, project/run APIs, authorization, and history behavior. The new public CTAs intentionally lead to CLI information rather than pretending to offer authenticated functionality. Add cross-product navigation only as an explicitly reviewed integration decision. |
| Product claims | The other application's code includes workspace/upload/history foundations, while these public guides describe the nested platform's capabilities as planned. Reconcile wording against the actually deployed and verified feature set before a combined product release. Do not infer production readiness from code presence alone. The older app's CLI setup text also needs reconciliation with the verified Node >=22.19 requirement. |
| Global styles | Public styles use scoped CSS modules and documentation theme variables. The other app has broad `body`, heading, link, input, button, and `small` rules. Preserve its stylesheet and verify public pages under that cascade; do not replace global styles wholesale. |
| Package/config files | The apps have different package manifests, lockfiles, Prisma versions and Next.js configuration. Retain the selected app's dependency/configuration ownership and security settings; no package upgrades or Prisma changes are part of this work. |
| Test relocation | `generate.test.ts` reads the existing CLI parser using a relative path to repository `src/index.ts`. If files move, deliberately update that test fixture path and ensure `tsx` is available in the chosen project. Keep the parser-contract and native quoting checks; do not silently drop them. |

Recommended integration sequence: review the intended base and existing setup commit; isolate the public website diff for review; resolve app/route ownership first; preserve providers, private routes, configuration and global styles; reconcile product wording; then run the checks below and the chosen application's existing auth/dashboard/security tests. No integration or restructuring was performed during this task.

## Post-merge verification (Windows PowerShell 7)

Run from the repository checkout. These commands target the current nested public workspace; adapt them explicitly if integration selects the other app.

```powershell
Set-Location qa-check-platform
# Install only in a fresh checkout or when dependencies are missing:
npm.cmd ci
npm.cmd run typecheck --workspace=@qa-check-platform/web
npm.cmd run build --workspace=@qa-check-platform/web
$env:PWSH_EXECUTABLE = (Get-Process -Id $PID).Path
node --import tsx --test apps/web/components/docs/command-builder/generate.test.ts
npm.cmd run start --workspace=@qa-check-platform/web -- --port 3100
```

In another terminal, open `http://localhost:3100` and verify every route above. Check all internal links/fragments, search matches/empty results, FAQ search deep links and Enter toggles, mobile navigation, themes, valid/invalid builder inputs and all presets, and clipboard success/failure. Check console errors and widths 1440, 768, 390 and 320px. Verify unknown documentation URLs return 404. If combining apps, additionally test login/logout, protected dashboards, existing project/run/history links, and existing integration/security tests in the selected app with approved configuration. Do not run migrations or seed production data as a public-page smoke test.

Finally inspect `git status --short --untracked-files=all`, `git diff --cached --name-only`, and `git diff --check` before any later authorized staging/commit.

## Current verification and limits

- Frontend TypeScript and production build passed; 31 command-builder tests passed, 0 failed/skipped.
- Ten public routes returned HTTP 200; all 129 distinct internal URL/fragment targets checked in server-rendered HTML resolved without failure.
- Browser smoke tests passed: landing-to-docs navigation, documentation search, mobile menu, FAQ deep-link reveal after hydration and keyboard toggling, command generation with spaces/apostrophes, invalid-number copy disabling, successful clipboard copying, and landing/builder layout at all four widths. No console warnings/errors were captured in the smoke session.
- Earlier detailed QA audit: 95/100, all 11 applicable scanners executed; Lighthouse sampled only `/` and `/docs` (final average performance 90). No expensive full audit was rerun for this merge preparation. Other documentation layouts, clipboard failure, themes and broader accessibility were covered by that earlier audit rather than re-certified here.
- Known limitations: PowerShell 7+ output only; no command execution, filesystem/config inspection or persistence. Some advanced CLI options are intentionally excluded. Public pages do not require backend/database/auth services.
- Canonical URLs, robots.txt and sitemap.xml still require the verified deployment origin/indexing policy. Social metadata is text-only. npm returned HTTP 403 during earlier automated external-link verification; no dead internal link was found. External links were not rechecked in this focused pass.

## Deployment and release assessment

The public workspace is ready for review and standalone release checks. A combined authenticated product release is **not certified**: application-root selection, duplicate route/content decisions, and provider/global-style integration remain explicit gates. Choose the correct build root and lockfile; use the existing Node 24 setup, HTTPS for clipboard APIs, and a verified production origin. Confirm proxy/base-path behavior because internal links currently assume deployment at `/`. Do not expose local reports, credentials or backend-only variables to the frontend.

Likely textual conflicts are `app/page.tsx` and `app/layout.tsx` if the same nested workspace changed elsewhere. Integration into root `apps/web` additionally creates semantic route/layout/style conflicts even when Git reports a clean merge. This review does not validate unseen branches or live remote changes.

Suggested later commit message: `feat(platform): add public website, documentation, and CLI command builder`
