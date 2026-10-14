# Lab 10 runtime and reporting fixes

Next production builds and development servers share a configured `distDir` (normally `.next`). The Build scanner previously invoked `npm run build` in the original project directory before frontend readiness. This allowed a production build to invalidate chunks/manifests used by an externally running dev server. The new scanner builds a temporary source snapshot beside the project on the same drive. It copies configuration and application source, links existing dependencies, excludes generated caches/reports, and removes only its own snapshot. Compiler changes to the copied `tsconfig.json` or `next-env.d.ts` are reported as snapshot mutations, not original project mutations. Missing dependencies or snapshot permissions produce a failed build, never an in-place fallback.

Using `distDir` alone would isolate compiled output but would still allow Next to write TypeScript configuration in the original source tree. A source snapshot isolates both kinds of output. Keeping it on the same drive also avoids a verified Windows Webpack error when Next constructs relative entries across volumes. This requires a writable parent directory and installed dependencies. Custom builds relying on absolute original paths, external workspace source, or scripts with side effects outside their working directory require separate validation. Dependencies are shared; dependencies and arbitrary build scripts are not sandboxed.

API tests with absolute configured URLs no longer await the frontend server. Relative API cases still require the selected local runtime. Before external API cases run in a full scan, a configured successful GET with a JSON response verifies each origin; optional required fields remain enforced when supplied. This preserves the Lab 10 Health case without changing its expectations. Absolute targets are never rebased onto the frontend. Expected 404/401/422 cases and the existing 15-second API request limit remain unchanged.

Readiness logs the exact GET URL and status. Three consecutive HTTP 500 responses stop readiness by default rather than retrying for five minutes. `runtime.maxReadinessHttp500Responses` configures that threshold (1–20). Successful/different statuses reset the counter; transient 502/503/504 and connection errors remain bounded by their independent readiness budgets. Unexpected 401/403/404 readiness responses fail promptly as inaccessible/missing readiness routes. Identity markers also stop on persistent 500. Owned startup failures preserve captured compiler output in diagnostics and clean up their process tree; external servers remain untouched.

ESLint runs only with a discovered configuration (including a package `eslintConfig`). Missing configuration is NOT APPLICABLE. There is no interactive `next lint` setup fallback. Command stdin is closed. ESLint PASS requires a successful zero exit and verified JSON output; a failed command or setup prompt without findings is ERROR with no score. Nonzero exits with verified rule findings remain FAIL. Tooling failures do not invent lint defects.

Configuration JSON and API manifest JSON accept an initial UTF-8 BOM. A frontend can inherit configuration from its immediate parent when that parent has a package manifest and `qa-check.config.json`; a child config takes precedence. The engine also loads configuration for programmatic callers. When the requested package root has no recognized framework and exactly one immediate browser-framework child, the engine selects that child while retaining the root configuration. Ambiguous roots require an explicit child path.

Reports retain the existing numeric `overallScore` for compatibility and add `scoreEvidence`:

```json
{
  "status": "PROVISIONAL",
  "observedScore": 100,
  "missingScanners": ["SEO"],
  "warning": "INCOMPLETE AUDIT: score reflects available scanner evidence only. Unexecuted checks and routes are unknown; their defects have not been ruled out."
}
```

With no executed evidence, `observedScore` is null and status is INSUFFICIENT_EVIDENCE. Terminal and HTML visibly label incomplete scores and show the warning. A partial scan cannot pass the current gate without full evidence, and blocked/error/timeout/partial evidence prevents a full regression-gate PASS. Compatible completed scanners can still report their evidenced changes; unavailable scanners do not generate fixed defects.

History snapshots record full execution comparability and a hash of project, pipeline, routes and scanner target/configuration scopes. Missing evidence, changed scopes and legacy snapshots without these fields suppress score/issue deltas and display INCOMPARABLE. Historical numeric scores are labeled provisional where scope is unverified.

Absolute `--output` paths now remain absolute on Windows. Screenshot directories are created before launching a browser so a directory error cannot strand that browser.

## PowerShell commands

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
npm run build
npm test
node .\bin\qa-check.js api 'D:\qa-check-testing-projects\qa-check-lab-10-fullstack'
node .\bin\qa-check.js 'D:\qa-check-testing-projects\qa-check-lab-10-fullstack\frontend' --profile full --url http://localhost:3100
Invoke-WebRequest -Method Get -Uri http://localhost:3100/ -SkipHttpErrorCheck
Invoke-WebRequest -Method Get -Uri http://localhost:3100/api/health -SkipHttpErrorCheck
```

The full-scan command reads the root API configuration through immediate-parent inheritance. Its frontend must be healthy; HTTP 404 or 500 on the homepage must not be inferred from HEAD alone. Do not reset the Lab database, alter business logic, delete the live `.next`, or restart an external server to make scanner findings disappear. Controlled verification uses an unchanged disposable source copy when the existing external frontend is already unhealthy.
## Lab 10 follow-up

See [the follow-up validation](lab10-followup-validation.md) for Lighthouse worker reuse and bounded recovery, an optional associated/visible form-label policy, inherited privacy metadata, safe manual frontend recovery, and the opt-in security review. Current results and ground-truth statuses are in `test-reports/lab10-followup/verification.md`; the earlier `test-reports/lab10` evidence remains a historical run.
