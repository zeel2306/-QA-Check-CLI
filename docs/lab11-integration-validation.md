# Lab 11 integration validation — 11 October 2026

Implementation workspace: `C:\Users\Dell\Desktop\-QA-Check-CLI`. The alternate main-project path in the request does not exist. Original fixture: `D:\qa-check-testing-projects\qa-check-lab-11-cicd`.

## Root causes and corrections

1. **ESLint source selection.** Invoking ESLint 8 with `.` did not select the fixture's TypeScript sources as its explicit `eslint "src/**/*.{ts,tsx}"` script does. The CLI now reuses literal direct ESLint script arguments without executing shell expressions, strips mutation/output options, and forces structured JSON output. When necessary, it discovers explicit source filenames, excluding generated files and dependencies. Directory expansion preserves warning-gate options. Exit 1 with verified findings remains FAIL; exit 2 remains ERROR even when partial findings exist.
2. **Broken-image evidence.** The static scanner treated all image strings as active image elements. Missing JSX/TS/Vue source references now remain unverified candidates unless rendered failure confirms them. An inactive conditional reference is retained separately in report metadata, not counted as a confirmed defect. Without runtime evidence, conditional references produce PARTIAL rather than a clean PASS or an invented FAIL. Ordinary unconditional static-image checks remain supported.
3. **Route inventory.** The fourth declaration was `/*`, originating from React Router's `path="*"` not-found fallback. It is not a navigable fourth page. Discovery records it separately as fallback metadata and inventories the three concrete pages `/`, `/contact`, `/products`. Genuine dynamic declarations remain in the inventory; no concrete routes were silently discarded to improve coverage. HTML exposes the fallback separately.
4. **Lighthouse source-map processing.** The original Vite runtime serves optimized dependency maps with no sources, including two chunk maps with mappings length 9 and a React re-export map with mappings length 0. Lighthouse's bundled Chrome DevTools `SourceMap.parseMap` accesses `sourceInfos[sourceIndex].sourceURL` without checking that a source exists. Its own catch logs the exception and returns empty mappings while Lighthouse still returns scores. A standalone reproduction with an empty source map confirms this parser behavior. This is source-map tooling evidence, not an application console error. The CLI retains and deduplicates the full diagnostic stack and associated source-map summaries, reports PARTIAL, and keeps mapping-dependent evidence incomplete. It does not suppress genuine Lighthouse failures or increase budgets.

Additional integration correction: Vite's source `index.html` was accepted as a compiled build. This selected preview before compilation and allowed a raw static fallback to serve TSX with an invalid MIME type. Vite startup now requires an actual compiled output before choosing preview or permitting that fallback.

HTML inspection also found Lighthouse page-score rows incorrectly grouped as Missing Alt findings. They now appear as audited page scores, separate from defect counts and tooling diagnostics.

## Changed implementation files

| File | Change |
| --- | --- |
| `src/lint.ts` | Safe script target reuse, source discovery, preserved gate options |
| `src/checks/command.ts` | ESLint execution ERROR versus genuine rule FAIL |
| `src/checks/brokenImages.ts` | Runtime confirmation and unverified source candidates |
| `src/crawler.ts` | Separate bare fallback declarations from concrete page inventory |
| `src/pipeline/runtime.ts` | Retain discovered fallback metadata across pipelines |
| `src/core/readiness.ts` | Runtime diagnostic field for fallback declarations |
| `src/core/runner.ts` | Distinguish Vite source entry from compiled preview output |
| `src/checks/lighthouse.ts` | Retained parser diagnostics, source-map evidence, PARTIAL classification |
| `src/core/exitCode.ts` | Nonzero default exit for PARTIAL, TIMEOUT, and BLOCKED execution |
| `src/reporters/html.ts` | Expose diagnostics/candidates/fallbacks; separate Lighthouse scores from findings |
| `src/tests/lab11Integration.test.ts` | 13 automated integration regressions |

Existing unrelated workspace changes were preserved. No commit, push, or publication was performed.

## Live validation

The complete application audits used a disposable source copy with existing dependencies. Only that copy activated the fixture's existing regression scenario and received a temporary lint-rule probe. The original fixture's source, scenarios, scripts, configuration, HTML entry, and public assets have identical before/after SHA-256 hashes. The original server on port 3111 remained running.

| Run | Concrete routes audited | Scanner execution | Lighthouse | Broken Images | Current gate | Default CI exit |
| --- | --- | --- | --- | --- | --- | --- |
| Fresh Vite development, clean scenario | 3/3 | 12/12, 100% | WARNING, 3/3, performance 62; no parser exception in this run | PASS, zero confirmed defects | PASSED, FULL confidence | 0 |
| Compiled production preview, clean scenario | 3/3 | 12/12, 100% | PASS, 3/3, performance 100; no parser exception | PASS, zero confirmed defects | PASSED, FULL confidence | 0 |
| Existing regression scenario activated in copy | 3/3 | 12/12, 100% | PASS, 3/3 | FAIL, one confirmed `/missing-banner.png` defect | FAILED, FULL confidence | 2 |

The clean app rendered its real heading and `/logo.svg` with nonzero natural width; `/logo.svg` returned HTTP 200. Standalone lint and CLI lint both exited 0 and produced structured output for `src/main.tsx` and `src/scenario.ts`. Introducing `debugger;` only in the disposable copy produced lint exit 1 with the `no-debugger` finding intact.

The activated scenario also failed Console Errors and Network Errors. Against the production report, the existing regression implementation reported 8 NEW ISSUES, 0 FIXED ISSUES, and a failed regression gate. These are the report's comparison entries, not eight distinct application defects; its canonical defect list contains two entries. No totals were hard-coded in scanners or validation assertions.

A separate read-only audit of `/` on the **original port 3111** reproduced the source-map exception: Lighthouse returned PARTIAL, 1/1 page completed, performance 62, with one deduplicated `SOURCE_MAP_PARSE_FAILED` diagnostic. Two console emissions shared the same stack. The affected map-dependent evidence remains incomplete; this original development runtime is **not** declared a clean baseline. Fresh Vite optimization and compiled preview produced different mapping evidence and did not reproduce the exception.

## Tests and report inspection

`npm test` builds the implementation and runs the complete existing suite plus the 13 new regressions. Final results are recorded in `test-reports/lab11/full-tests.log`.

Final automated result: **276 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; suite exit code 0; duration 149.864 seconds.**

Regression coverage includes TS script targets, fallback source discovery, preserved warning gates, exit-2 errors with retained findings, active/inactive/no-runtime image evidence, fallback versus genuine dynamic inventory, Vite source/build distinction, source-map PARTIAL versus real Lighthouse ERROR, CI exits, and escaped diagnostic HTML with separate page-score presentation.

All three full HTML reports and the original-server diagnostic report were opened in Chrome, checked for page errors, and captured. Visual inspection confirmed clean images show zero findings, activated images show one confirmed finding, and the original Lighthouse diagnostic remains visibly PARTIAL with its stack retained.

Evidence under `test-reports/lab11/`:

- `full-tests.log`: complete automated test output.
- `runtime.log`: complete development, production, and activated-regression terminal output.
- `live-validation.json`, `lint-parity.json`, `lint-failure.json`: structured validation results.
- `source-before.json`, `source-after.json`: original fixture hashes.
- `original-lighthouse.json`, `source-map-parser-reproduction.log`, `vite-client-source-map.json`: source-map investigation.
- `development/index.html`, `production/index.html`, `regression/index.html`, `original-diagnostic/index.html`: inspected HTML artifacts.
- `html-inspection.json` and each report directory's `*-card.png`/`report-overview.png`: browser inspection evidence.

## Remaining limits

The upstream source-map parser/dependency-map interaction still occurs on the original development server. It is explicitly classified and retained, not fixed by editing Lighthouse's installed dependencies or modifying the fixture. Production preview is the verified complete audit path.

The activated fixture's placeholder-only field does not automatically fail existing axe accessible-name checks; the separate form-label policy was not enabled in these runs. Its `/broken-page` link is accepted by the declared SPA fallback and returns HTTP 200, so this run does not prove detection of that additional seeded link scenario. These observations are not represented as detected defects, and this task does not claim all Lab 11 ground-truth scenarios are covered.

CI regression tests confirm default FAIL, ERROR, PARTIAL, TIMEOUT, and BLOCKED results exit 2; warning-only `failOn=warning` exits 1; a complete passing run exits 0. Explicit `failOn=none` remains an opt-out. Source-map diagnostics preserve numeric scores but do not produce a complete audit gate.
