# Lab 13 CI investigation — c5f48fe

Commit: c5f48fe9edf26579f6df41d139e58c4b19be7645. Branch: testing-branch. Investigation date: 2026-10-21.

## Verified hosted failure

Lab 13 run: https://github.com/zeel2306/-QA-Check-CLI/actions/runs/39629479231

| Matrix job | Job ID | GitHub conclusion | Interpretation |
|---|---|---|---|
| ubuntu-latest / Node 22 | 119323478768 | success | Platform integration job passed |
| windows-latest / Node 22 | 119323479349 | success | Platform integration job passed |
| macos-latest / Node 22 | 119323478940 | cancelled | Hosted runner was never acquired; no test steps executed |

The macOS check annotation explicitly states: **The job was not acquired by Runner of type hosted even after multiple attempts**. Three notices identify macOS arm64 capacity constraints. The job has runner_id=0, empty runner_name, and steps=[]. Its API timestamps span 15:51:35Z to 16:06:38Z (15 minutes, 3 seconds). These are scheduling timestamps, not audit runtime. The workflow's 30-minute execution timeout is not evidence of a scanner timeout.

This job never checked out the repository, installed dependencies, built the package or started a browser/scan. Its cancellation therefore cannot have been caused by tinyglobby execution. Windows and Ubuntu passed with the migrated package. The Lab 13 workflow is unchanged between d0b593e and c5f48fe, including its runner selection. macOS package functionality is unverified by this cancelled leg; do not convert it to PASS or silently exclude it.

Only Windows and Ubuntu artifacts exist in this run: lab13-package-windows-latest (137,995 bytes) and lab13-package-ubuntu-latest (142,282 bytes). There is no macOS artifact or executed step log to inspect. The public REST job/check metadata and annotations are saved under test-reports/lab13-c5f48fe-investigation.

## Correct recovery

No CLI, dependency, browser, scoring, assertion or workflow change is justified by this failure. Re-run the failed/cancelled Lab 13 job on the same commit when hosted macOS capacity is available. In the run UI choose **Re-run failed jobs**, then require an actual successful macOS integration result and its reports/cleanup artifact before claiming complete platform validation.

Do not raise scanner timeouts, skip macOS, force success, accept partial coverage or change runner architecture to make this scheduling failure green. A repeat cancellation with the same acquisition annotation should be handled as a GitHub hosted-runner availability issue; consider GitHub status/support or an explicitly reviewed runner-capacity alternative. A workflow step cannot retry work that never receives a runner.

No remote rerun was dispatched from this investigation. The available access is unauthenticated, and the user requested findings first.

## Lab 14 on the same commit

Run: https://github.com/zeel2306/-QA-Check-CLI/actions/runs/39629479317

All nine jobs reached and failed the Test installed tarball release readiness step, and all nine uploaded artifacts. Unlike the Lab 13 macOS cancellation, these jobs did execute. A failed step alone does not distinguish harness exit 3 (security block) from exit 1 (functional/cleanup failure).

Public REST log download returned HTTP 403 and artifact ZIP download HTTP 401. No authenticated CLI is installed. The existing Downloads/lab14-artifacts reports belong to the earlier October 17 run and were not used as evidence for c5f48fe. The user supplied nine newly downloaded ZIPs in Downloads with the suffix " (1).zip". **Every ZIP size and SHA-256 digest matches its artifact metadata for run 39629479317**, establishing provenance (artifact-provenance.json).

All nine new results.json files and cleanup records were read, together with browser-probe logs, diagnostic logs and all 27 scan reports. The verified matrix is:

| Platform | Node | Functional | Security source / consumer | Harness exit | Cleanup |
|---|---|---|---|---|---|
| Windows | 20.20.2 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| Windows | 22.23.3 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| Windows | 24.22.0 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| Ubuntu | 20.20.2 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| Ubuntu | 22.23.3 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| Ubuntu | 24.22.0 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| macOS | 20.20.2 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| macOS | 22.23.3 | PASS | BLOCKED / BLOCKED | 3 | PASS |
| macOS | 24.21.0 | PASS | BLOCKED / BLOCKED | 3 | PASS |

Each source audit reports 27 affected package entries: 8 high and 19 moderate. Each consumer audit reports 28: 8 high and 20 moderate. No critical findings were reported. The extra consumer parent entry is qa-check-cli, moderate, inherited through Lighthouse. No security ERROR/missing evidence, functional error or cleanup error is recorded.

Every clean/defect/recovery scan scored 100/96/100 with exits 0/2/0, 100% coverage and FULL confidence. Complete HTML/JSON/Markdown/PDF reports and browser cleanup evidence are present. All four cleanup flags are true for every job. hosted-lab14-matrix.json and hosted-lab14-diagnostics.json retain the derived evidence. These successful macOS Lab 14 executions provide additional actual runtime evidence for the tinyglobby migration; they do not replace the cancelled Lab 13 leg's required rerun.

The existing strict policy blocks high/critical findings and incomplete audit evidence. An expected security-only failure must have functional.passed=true and exitCode=3 in results.json, with complete scanner/cleanup evidence. Neither that expected block nor a genuine functional error should be changed to CI success.

## Fresh local validation

Fresh local results on Windows x64 / Node 22.14.0:

| Check | Actual result |
|---|---|
| npm run build | PASS, exit 0 |
| Complete npm test | 292 passed, 0 failed, 0 skipped; exit 0 |
| Release security policy tests | 2 passed, 0 failed; exit 0 |
| Lab 11 | PASS, harness exit 0; clean/regression/recovery scores 100/94/100, scanner exits 0/2/0 |
| Lab 12 | PASS, harness exit 0; clean/defect scores 100/96, scanner exits 0/2 |
| Lab 13 | PASS, harness exit 0; clean/defect/recovery scores 100/96/100, scanner exits 0/2/0 |
| Lab 14 | Functional PASS, expected security-only harness exit 3; scan scores 100/96/100 and exits 0/2/0 |
| Local Lab 14 security | Source 8 high/19 moderate; consumer 8 high/20 moderate; both BLOCKED |
| Package scan coverage/confidence | 100% and FULL; incomplete scanner statuses rejected by unchanged assertions |
| Cleanup | PASS; final Lab 13/14 temporary storage removed, owned children stopped, source unchanged during harness execution |
| git diff --check | PASS |

No local functional, browser, packaging or cleanup failure occurred in this validation. Repository files were held unchanged during all package harnesses. Logs, actual exit files and local-final-summary.json are under test-reports/lab13-c5f48fe-investigation. Existing source, pipeline, discovery and security-policy assertions were not changed, skipped or weakened. Node >=20 remains declared, with hosted Lab 14 functional evidence across Node 20/22/24 on all three operating systems. The cancelled Lab 13 macOS job must still be rerun before marking that workflow green.

## Files changed and remaining action

The only changed file is this investigation document. No production code, package manifest, lockfile, tests, runner label or workflow was changed. The verified acquisition failure is outside CLI execution, so a speculative code or timeout change would not address its cause.

Re-run the failed/cancelled job in Lab 13 run 39629479231. Inspect the new macOS artifact and actual successful result. Leave Lab 14's high/critical security block intact; its nine red jobs are expected release-policy decisions, not evidence of a tinyglobby functional regression.

No production/dependency/security-policy/workflow change has been made. No commit, push, merge or npm publication is part of this investigation.
