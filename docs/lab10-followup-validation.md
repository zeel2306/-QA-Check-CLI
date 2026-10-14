# Lab 10 follow-up: form labels, Lighthouse and security scope

This document accompanies the follow-up validation evidence in `test-reports/lab10-followup`. Seeded frontend/backend behavior is unchanged. No npm publication, commit or push is part of this task.

## Lighthouse findings and configuration

The prior run had a 90,000 ms **whole-scanner** budget. Seven ordinary routes took 11.7–13.7 seconds each; `/help` was cancelled after only 1.6 seconds because the total budget expired. `/slow` had not been attempted. This establishes budget exhaustion under sequential orchestration, rather than evidence that the seeded slow route caused the previous failure.

The CLI now reuses the isolated Lighthouse worker across completed routes, avoiding repeated module initialization. A route timeout terminates its worker and Chrome session before bounded recovery on a fresh session; the timed-out route remains reported and subsequent targets may continue while total budget remains. Lighthouse retains its standard mobile simulated throttling, all four configured categories, load waits, and 25-second route deadline. No audit category or intentionally defective route was removed to improve completion.

Coverage now uses the actual 19 selected Lighthouse targets rather than the 49-route browser inventory. Metadata lists selected and unattempted targets, total budget and stop reason. The default remains 90 seconds. For Lab 10 validation, a 240-second total budget is explicitly supplied: 19 targets at the observed ~12-second cost need ~228 seconds plus small startup/slow-route margin. This is an evidence-based whole-run allocation, not a blanket increase to route timeouts. Configuration accepts an explicit total budget up to 600 seconds; the outer scanner deadline follows that allocation plus cleanup allowance. Explicit runtime scanner overrides still take precedence.

## Optional form-label policy

Use `"formLabelPolicy": "associated"` or `"formLabelPolicy": "visible"` in QA configuration. Omit the option to retain the default axe policy. Associated mode accepts nonempty explicit `<label for>`, implicit wrapping labels, or complete `aria-labelledby` references. Visible mode additionally requires the associated text element to be rendered visibly. Hidden controls and non-labelable input types are excluded. These are product-policy findings (`form-label-policy-*`), not declarations that axe's accessible-name rules or a particular WCAG criterion failed. An `aria-label` or placeholder may satisfy axe naming and still lack associated visible text.

Static HTML review now recognizes placeholder/title fallbacks and wrapping labels, and explicitly describes missing naming evidence as a static review rather than an axe failure. Runtime axe resolves accessible names; the optional rendered-DOM policy resolves associations and visibility. Policy scope participates in the accessibility baseline fingerprint so changing policy cannot manufacture fixed/new application findings.

## Privacy SEO interpretation

`frontend/app/privacy/page.tsx` does not declare its own description, but `frontend/app/layout.tsx` supplies `Full-stack QA fixture for testing`. The effective rendered privacy page has that valid description. SEO-01 is therefore **NOT APPLICABLE to missing effective rendered metadata**, rather than a missed missing-description defect. A product requirement for unique page-specific copy would be a separate opt-in editorial policy; this validation does not invent such a requirement.

## Five security scenarios: explicit opt-in coverage review

No new security requests, JWT attacks, destructive requests, or load tests were run. The configured invalid-login API case remains its existing API-02 finding; it does not prove token signature validation or admin authorization end to end. These five scenarios remain **MANUAL-ONLY / NOT EXECUTED** in the scanner comparison until a dedicated authorized test is run.

| Scenario | Safe opt-in design | Scope and limitations |
|---|---|---|
| SEC-01: invalid login grants admin | On a disposable local fixture, explicitly submit a single invalid login, assert rejection; if accepted, decode the returned token payload in memory and assert it does not contain `role: admin`. Redact tokens in evidence. | Payload decoding demonstrates a returned claim; it is not cryptographic signature verification or proof the token works on an actual protected admin route. Existing invalid-login API output already detects wrong HTTP acceptance. |
| SEC-02: unauthenticated PUT | Configure one explicit PUT to a unique disposable product ID, expecting 401/403, and verify no mutation. | Review current handler first: Lab 10 returns a stub without database mutation. Never generalize this safety to other apps or production; no automatic write probing. |
| SEC-03: unauthenticated DELETE | Configure one explicit DELETE to a unique disposable product ID, expecting 401/403, and verify absence of mutation. | Current Lab 10 handler is a no-op stub. A real delete requires explicit authorization, sacrificial data and recovery plan. |
| SEC-04: rate limiting | On an owned disposable backend, explicitly configure a modest request cap, delay and expected documented threshold; stop immediately on 429 or budget exhaustion. | Without a declared rate-limit contract, absence of 429 in a small sample is **NOT DETECTED / INCONCLUSIVE**, not proof that no limiter exists. Never brute-force passwords or run automatically. Source review of this fixture finds no rate-limit middleware. |
| SEC-05: weak example JWT secret | Explicit local file policy against placeholder/example keys; report only relative file/key name and policy result. | `.env.example` weakness is example-configuration hygiene; it does not establish the active deployment key is weak. Do not read/export real secrets or attempt token forgery. |

The API test manifest can express SEC-02/03 status expectations, but safe target authorization and response-body/token assertions for SEC-01 require an explicit harness or additional assertion support. None of these five scenarios has silently been added to default discovery or the normal audit.

## Original frontend recovery

The original port 3100 listener returns 404 for GET `/` while `/api/health` responds 200. Source contains the homepage; its generated page output was missing in the earlier inspection. A fresh runtime of unchanged source serves the homepage. This supports an inconsistent original runtime/cache state; it does not prove the exact historical trigger or reproduce a missing-chunk stack trace.

Use `test-reports/lab10-followup/recover-frontend.ps1` **manually in a separate PowerShell terminal** after reviewing it. It validates the listener's parent Next CLI against the exact frontend directory, records creation times to guard PID reuse, stops only those two verified processes, verifies the port was released, moves `.next` to an in-project timestamped backup and starts the existing dev script. It leaves port 4100 and unrelated processes alone. It refuses to proceed if ownership cannot be established; no `Stop-Process -Name node`, blanket `taskkill`, or recursive delete is used.

After starting, verify actual GET status and seeded homepage content, not only the health endpoint. Keep the backup until the homepage and audit are verified. No recovery script was executed during this validation.
