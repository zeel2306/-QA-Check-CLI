# Lighthouse route timeout investigation — 14 October 2026

## Original failure and controlled reproduction

The original Lab 11 report records `/` timing out at 25,012 ms, `/contact` completing at 11,668 ms, and `/products` completing at 7,922 ms. Its Performance 100 is an average of the two completed routes. It supplies no historical phase trace, so the precise original stall cannot be established from that JSON alone.

The runner is `src/checks/lighthouse.ts`. Its constructor previously defaulted `routeBudgetMs` to 25,000. A `Promise.race` timer enforced the smaller of that per-route budget and the remaining total Lighthouse budget, independently of Lighthouse's 20,000-ms load wait. Worker import, Lighthouse configuration, artifact gathering, trace parsing, and audit calculation were all included in the route timer.

A corrected controlled comparison on an isolated, compiled copy of the unchanged fixture reproduced the same pattern:

- **Homepage first, original 25-second limit:** homepage TIMED_OUT at 25,130 ms during `Getting artifact: Accessibility`; the other routes completed at 19,397 and 10,738 ms. Lighthouse import alone consumed 7,672 ms; gathering began at 11,134 ms.
- **Contact first, original limit:** contact TIMED_OUT at 25,011 ms during trace parsing; the homepage subsequently completed at 18,935 ms, and products at 13,527 ms.

This supports first-job initialization and processing overhead exceeding a tight whole-job deadline. It does not establish an expensive or defective homepage, nor a homepage network failure. Route ordering, host load, and cache warmth affect durations. Lighthouse work after navigation also needs time; a 20-second load allowance cannot reliably fit inside a 25-second end-to-end budget with startup and audits included.

The original-limit comparison now terminates workers and Chrome successfully while retaining PARTIAL, completed-only scores, and each timed-out route's reason. Evidence is `test-reports/lighthouse-timeouts/original-limit.json` and `.log`.

Earlier diagnostic iterations had a one-shot message-listener mistake introduced by progress instrumentation. Those iterations are not evidence of the original timeout cause. A dedicated regression test now checks that multiple progress messages cannot consume the final result listener. The valid controlled comparison above was run after this correction.

## Implementation

- Worker initialization is explicitly awaited before starting a route timer. It remains bounded by a 45-second initialization cap and the remaining overall budget; it is not unlimited or removed from total accounting.
- `lighthouseRouteTimeoutMs` defaults to **45,000 ms**, accepts positive integer milliseconds, and has an upper limit of **120,000 ms**. Invalid configuration fails clearly instead of silently reverting to a default.
- CLI supports `--lighthouse-route-timeout-ms` and `--lighthouse-budget-ms`. The independent overall default remains **90,000 ms**, with the existing maximum of 600,000 ms.
- The first worker is reused for completed routes. A timed-out worker is terminated before recovery; its owned Chrome instance is stopped before a fresh instance starts. No route is automatically skipped or retried to erase a failed attempt.
- Cleanup uses a unique owned profile and the launcher's owned Chrome PID/tree. It verifies process exit, closes its own streams/descriptors, and removes only its validated temporary profile. Cleanup is idempotent. Cleanup errors are retained separately and cannot replace a route's timeout reason or turn incomplete evidence into PASS.
- Phase traces, initialization duration, configured budgets, route diagnostics, cleanup events/errors, and unattempted routes are retained in JSON.
- Each result includes Lighthouse-specific route coverage. Failed or untested routes have no fabricated score. Numeric averages explicitly cover scored completed routes only. Missing Performance scores and `lhr.runtimeError` cannot produce a complete PASS.
- Any failed/timed-out route with other completed evidence leaves PARTIAL and the default CI exit code 2. Zero completed evidence remains ERROR or TIMEOUT, as appropriate. An interrupted outer execution retains already completed page evidence.
- Structured findings attach execution failures to the affected route rather than inventing slow-page findings on completed pages. HTML shows page scores separately from route execution diagnostics, timeout reasons, and untested targets.

## Modified files

| File | Purpose |
| --- | --- |
| `src/checks/lighthouse.ts` | Initialization, configurable deadline, persistent worker messaging, phase capture, partial coverage, cleanup evidence |
| `src/core/lighthouseSettings.ts` | Shared validated default and upper limit |
| `src/core/lighthouseChrome.ts` | Owned Chrome/profile lifecycle and verified cleanup |
| `src/core/config.ts` | JSON setting validation |
| `src/core/engine.ts` | Option definition and early validation |
| `src/pipeline/runtime.ts` | Forward route timeout to Lighthouse |
| `src/index.ts` | CLI flags and validation |
| `src/core/help.ts` | Document CLI flags |
| `src/core/normalize.ts` | Route-specific failure findings; exclude completed score records from defects |
| `src/reporters/html.ts` | Completed-only scores, route diagnostics and untested routes |
| `src/tests/lighthouseTimeouts.test.ts` | 12 automated regressions, including a real Chrome cleanup test |

## Verified results

The final `npm test` completed with **288 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**, exit code 0, in 175.753 seconds. The 12 new timeout regressions also passed independently, including real owned Chrome process/profile cleanup.

| Controlled case | Routes completed | Lighthouse status | Performance average | Default CI exit |
| --- | --- | --- | --- | --- |
| Original 25-second budget, homepage first | 2/3 | PARTIAL | 100, completed routes only | 2 |
| Original budget, contact first | 2/3 | PARTIAL | 100, completed routes only | 2 |
| Separate initialization + default 45-second route budget, homepage first | 3/3 | PASS | 100, all three routes | 0 |
| Separate initialization + default budget, contact first | 3/3 | PASS | 100, all three routes | 0 |

Final homepage-first durations were `/` 10,143 ms, `/contact` 7,571 ms, and `/products` 7,654 ms; initialization took 1,871 ms separately. Contact-first durations were `/contact` 9,462 ms, `/` 7,954 ms, and `/products` 8,004 ms; initialization took 3,022 ms. These timings are observations, not hard-coded expectations or guarantees.

All final cases retained zero cleanup errors. Chrome PIDs recorded in the two successful and two timeout-control cases were checked and were no longer active. The original fixture's source/scenario/configuration/public-asset SHA-256 hashes matched before and after validation. All four generated HTML reports were opened in Chrome with no page errors and visually inspected: the timed-out homepage has a reason and no score, while the successful report shows three actual page scores and 3/3 coverage.

Artifacts under `test-reports/lighthouse-timeouts/`:

- `full-tests.log`, `targeted-tests.log`: automated results.
- `original-limit.json`/`.log`: valid original-budget control evidence.
- `validated.json`/`.log`: final default-budget live validation.
- `validated-fixture-hashes.json`: original fixture preservation.
- `validation-summary.json`: route coverage, CI exit codes, cleanup and HTML inspection results.
- `original-limit-home-first/index.html`, `original-limit-contact-first/index.html`, `validated-home-first/index.html`, `validated-contact-first/index.html`: inspected reports, with corresponding `report.json` and `lighthouse-card.png` files.

These are isolated Lighthouse validations, not a claim that every scanner or configured external API test in the fixture's full CI scan passes. Other configured defects and failures retain their own gate semantics.

## Retest commands

From the CLI workspace:

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
npm test
node .\bin\qa-check.js 'D:\qa-check-testing-projects\qa-check-lab-11-cicd' --profile ci --ci --no-baseline --no-pdf --output '.\test-reports\lab11-timeout-retest'
```

For a deliberately larger, explicit allocation on a slower CI worker:

```powershell
node .\bin\qa-check.js 'D:\qa-check-testing-projects\qa-check-lab-11-cicd' --profile ci --ci --lighthouse-route-timeout-ms 60000 --lighthouse-budget-ms 180000 --no-baseline --no-pdf --output '.\test-reports\lab11-timeout-retest-60s'
```

Equivalent configuration fields can be merged into the existing `qa-check.config.json` without replacing its other settings:

```json
{
  "lighthouseRouteTimeoutMs": 60000,
  "lighthouseBudgetMs": 180000
}
```

An existing `runtime.scannerTimeoutMs` or `runtime.scannerTimeouts["Lighthouse Performance"]` setting can impose a shorter outer deadline. If the overall Lighthouse budget is intentionally raised, ensure that explicit outer setting allows it plus cleanup time. The default outer Lighthouse deadline remains total budget plus 15 seconds.

No fixture scenario was changed, no homepage was skipped, and no CI gate was forced to pass. Prior unrelated workspace changes are preserved. No commit, push, or publication was performed.
