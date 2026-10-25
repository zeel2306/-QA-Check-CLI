# Hosted failure fixes after 7d0bc2e

## Verified evidence

The three standalone Lab 13 ZIPs downloaded to Downloads contain Lighthouse 13.5.0 with consumer Chrome 156.0.8078.4 on Node 22.19.0. All have complete route evidence and successful owned-process/temp cleanup.

| Platform | Overall / Lighthouse | FCP / LCP ms | Server TTFB ms | Launch ms | Load average (1 min) |
| --- | --- | --- | --- | --- | --- |
| macOS ARM64 | 99 / 86 | 1456.76 / 1456.76 | 2 | 4216 | 39.32 |
| Ubuntu x64 | 100 / 100 | 622.81 / 753.61 | 2 | 1648 | 0.87 |
| Windows x64 | 100 / 100 | 651 / 810 | 2 | 981 | 0 |

The macOS product quality gate passed with FULL confidence; the harness failed its exact overall-100 assertion. The same fixture passed 100/96/100 in both macOS Lab 14 jobs. This supports environmental variability, not a persistent OS score contract or a verified product regression. CPU benchmark, raw Total Blocking Time and Speed Index were not retained, so exact attribution of all 14 Lighthouse points is unavailable. Windows load average is not a meaningful CPU comparison.

## Changes and contracts

The committed bin imported dist/index.js before runtime validation. All three runtime ZIPs confirm Node 20 reached the loader's initialization trap. The existing working-copy bin correction loads the metadata-based runtime guard first; its regression test now rejects application initialization before the guard for version/help/scan commands. The actual packed-runtime harness remains strict and unchanged.

Lab 13 now checks real aggregate score accounting using the installed consumer's scoring implementation, while checking the deterministic fixture contribution exactly (100 clean/recovery, 96 defective) after neutralizing only Lighthouse's variable contribution in a separate assertion copy. Reports retain actual scores and warnings. This is a package integration contract, not a controlled performance benchmark.

Explicit budgets require finite nonnegative FCP <=1800 ms, LCP <=2500 ms, CLS <=0.1, server TTFB <=800 ms. Lighthouse must complete, remain within the product's non-failing score range, include the sole expected route and clean up without errors. All other scored clean checks remain exactly 100. Existing defect markers, scenario exit codes, four report formats, coverage, FULL confidence, quality/regression gates and compare assertions remain intact. Tests reject metric regressions, missing evidence, incomplete audits, incorrect totals and missing seeded defects. Lab 14 security and release assertions are unchanged.

## Validation

Final Windows validation on October 22, 2026:

| Check | Result |
| --- | --- |
| Build and complete source suite, Node 22.19.0 | 300 passed, 0 failed, 0 skipped |
| Build and complete source suite, Node 24.22.0 | 300 passed, 0 failed, 0 skipped |
| Release policy tests, each supported runtime | 2 passed each |
| Package path isolation tests, each supported runtime | 14 passed each |
| Lab 11, Node 24.22.0 | PASS, clean/regression/recovery |
| Lab 12, Node 24.22.0 | PASS, clean 100 / exit 0, defect 96 / exit 2 |
| Lab 13 isolated final rerun, Node 24.22.0 | PASS, 100/96/100, exits 0/2/0 |
| Lab 14 final rerun, Node 22.19.0 | PASS, 100/96/100, functional and security gates pass, harness exit 0 |
| Source production audit | 0 findings before / 0 after |
| Actual installed packed-consumer production audit | 0 findings before / 0 after |
| Fresh tarball runtime contracts | Node 22.19 and 24 version/help PASS; Node 20.20.2 version/help/scan rejected with exit 1 and public compatibility message |
| Node 20 strict npm installation | Rejected with EBADENGINE |
| Reports and cleanup | HTML/JSON/Markdown/PDF checks passed; final package harness cleanup assertions passed |
| Workflow syntax / diff | All five existing workflows pass actionlint; git diff --check passes |

No baseline was refreshed, no dependency or workflow was changed, and no release threshold was changed. Final scan coverage is 100% with FULL confidence. Packed runtime tests also verify empty external command working directories, no source/global CLI imports, and the initialization-blocking loader trap; it was not removed to make Node 20 pass.

Two earlier local attempts failed and were not accepted as passes: Lab 14 returned 1 from the installed shim help command despite printing help, and a subsequent Lab 13 recovery scan timed out waiting 45,025 ms for worker initialization (coverage 88%, exit 2). Both resources stopped without cleanup errors. Isolated reruns passed without increasing timeouts or changing assertions; exact causes of these transient local failures remain unproven. Preserve them as reliability evidence rather than claiming every attempt was green. The unusually long Lab 12 elapsed install time is recorded in npm diagnostics; the installation completed successfully.

Evidence under ignored test-reports/: lighthouse13-cross-platform/local-results.json and its source/policy/lab logs; hosted-failure-evidence/lab13-retry.log and final-integration-exits.json; lighthouse13-cross-platform/path-results.json; lighthouse13-runtime/results.json, command-*.json and cleanup.json; lab14-release/win32/results.json and audit artifacts. Earlier failed attempts are archived under hosted-failure-evidence/initial-local-lab14 and local-lab13-timeout. All seven available standalone hosted scenario reports pass the new invariant offline; macOS has only a clean report because its old assertion aborted the remaining scenarios.

These changes are ready for another hosted CI run, not final release approval. Updated execution on Ubuntu/macOS and all three hosted Node 20 rejection jobs remains pending. Lab 14 retains its original exact score assertions as well as its strict security policy; any new failure must be investigated. Include bin/qa-check.js in the next manually approved commit: its guard-first correction was present locally but absent from 7d0bc2e. Pre-existing README runtime documentation edits were preserved. No commit, push, tag, release or publication was performed.
