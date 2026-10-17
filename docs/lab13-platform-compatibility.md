# Lab 13 — cross-platform installed-package compatibility

The new lab13-platform workflow runs independently on windows-latest, ubuntu-latest and macos-latest with Node 22, fail-fast disabled and read-only repository permissions. It never publishes or invokes qa-check-cli@latest. Existing workflows and dependency versions are unchanged.

## Test design

The Lab 13 harness derives its packaging/consumer checks from Lab 12 without modifying that proven harness. It builds, validates npm pack --dry-run, packs a local tarball, verifies integrity/contents, installs --omit=dev into an external temporary consumer and invokes only its absolute installed bin. NODE_PATH/NODE_OPTIONS are cleared and an ESM loader forbids module imports outside the consumer. The npm-created shim/shebang, runtime files, command branches and no-source-link installation remain mandatory.

Temporary parent, consumer installation, HTML fixture, working directories, init target and report paths contain spaces and nested components. Clean scan uses a native relative path from a different working directory; defective scan uses an absolute path; recovery uses '.' from the fixture. Report output and baseline arguments are relative paths across directories. Doctor tests forward slashes on every platform, supplementing native backslashes on Windows. POSIX explicitly tests rejection (exit 1/ENOENT) of a nonexistent Windows-style path; backslash is a literal POSIX filename character, not an alternate separator. This is a platform contract, not a skipped test. UNC/network volumes, arbitrary Unicode names, Windows extended-length paths and literal-backslash POSIX filenames are not covered by this lab.

The clean HTML fixture is Lab 12's complete SEO/accessibility fixture; regression adds /ghost and /missing.png, and recovery restores it. Required scores are clean 100, defect 96, recovery 100. Required scan exits are 0, 2, 0. Regression comparison must fail and recovery comparison must pass with fixed issues and zero new issues. All scans require 100% applicable coverage, FULL confidence, correct route/project identity and no ERROR/PARTIAL/TIMEOUT/BLOCKED/SKIPPED scanners. HTML, JSON, Markdown and real PDF signatures are checked on every OS; no format is silently disabled. Other supported command branches exercise help aliases, doctor, init, fix dry-run and empty API/E2E/flow configuration paths; configured API/E2E journeys remain covered by separate labs.

## OS prerequisites and CI

PowerShell Core is the common workflow shell provided by hosted runners. npm's JS entrypoint is resolved from the active Node installation (Windows node_modules layout or Unix ../lib/node_modules layout), with npm_execpath supported for custom installations. Shell-dependent npm.cmd invocation, Unix readlink, setsid, /proc and Linux commands are not assumed on Windows/macOS.

Only Ubuntu runs Playwright install-deps chromium. The consumer's own Playwright installs Chromium on all three systems. Each job uses a dedicated RUNNER_TEMP directory for TMPDIR/TMP/TEMP and browser cache. macOS /var versus /private/var aliases are canonicalized before containment checks. No CHROME_PATH pointing at source node_modules or global CLI is injected. Browser/native installation failures are actual test failures, not unsupported skips.

The harness records OS/architecture/Node/npm metadata, each command/argument array/cwd/PID, package inventory, report formats, results.json and cleanup.json. Owned child processes have a five-minute outer command budget, bounded termination, and SIGINT/SIGTERM cleanup; scanner deadlines and gates are unchanged. Ordinary success/failure removes temporary consumers/tarballs and closes the HTTP server, compares source hashes and writes a final verdict only after cleanup. CI always revalidates its private directory, stops orphan processes whose command lines reference that unique directory (Windows CIM or POSIX ps), removes private files/browsers and uploads evidence under lab13-package-<runner OS>. No unrelated processes are targeted. Abrupt runner loss/SIGKILL can prevent post-processing; the job VM is discarded.

## Results

| Platform | Local status | Hosted status |
| --- | --- | --- |
| Windows x64, Node 22.14.0 | PASS after consumer browser selection fix | Run #2 failed startup; fix awaiting hosted rerun |
| Ubuntu, Node 22 | Not available locally | Run #2 PASS |
| macOS, Node 22 | Not available locally | Run #2 clean score 99; artifact unavailable for diagnosis |

Local Windows validation on 2026-10-15 produced scores/exits 100/0 (clean), 96/2 (defect), and 100/0 (recovery), with 100% applicable coverage and FULL confidence throughout. All three scans generated HTML, JSON, Markdown and PDF reports. Broken Links and Broken Images detected the seeded defects; recovery recorded zero new issues and fixed issues. Both comparison commands returned their expected exits. The installed tarball contained 156 files, 148,832 compressed bytes and 632,744 unpacked bytes. Cleanup confirmed the external consumer was removed and source hashes were unchanged. Source tests: 282 passed, 0 failed, 0 skipped. Actionlint, YAML parsing, all six PowerShell step scripts, Node syntax and git diff --check passed.

Do not infer three-platform compatibility from a local Windows pass. Review each matrix leg's artifact and environment.json (including architecture) independently. No new package upgrades, engine changes or vulnerability waivers are part of this work; the existing 30 production audit findings remain separate security work. The CLI is invoked through Node with its absolute installed bin; shim existence is checked, but interactive launcher behavior across every shell is not tested. When Windows temporary storage and checkout are on different volumes, path.relative necessarily returns an absolute output/baseline path; same-volume runs exercise relative arguments.

## Reproduce on Windows PowerShell

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
git branch --show-current
npm ci
npm run build
npm test
if ($LASTEXITCODE -ne 0) { throw 'Source suite failed' }
node .\tests\integration\lab13-platform.mjs
if ($LASTEXITCODE -ne 0) { throw 'Lab 13 failed; inspect test-reports/lab13-platform/win32' }
git diff --check
git status --short
```

On Ubuntu/macOS use the same npm and node commands from the repository root (with '/' path separators); Ubuntu additionally requires `node node_modules/playwright/cli.js install-deps chromium` before the harness. For custom npm installations set npm_execpath to the actual npm/bin/npm-cli.js file. No global QA Check installation is needed.

## Lab 13 run #2 investigation (fb3fcc6)

The hosted Ubuntu leg passed; Windows failed at Chrome startup and macOS reported a clean score of 99. These are separate failures. Lab 13 previously installed Playwright Chromium without selecting it for Lighthouse, which independently discovered system Chrome. The shared package-browser.mjs helper now contains Lab 12's verified consumer-specific CHROME_PATH selection and bounded CDP probe; both labs call it. All probe imports, including the Chrome lifecycle helper, come from the isolated installed consumer under its existing module guard. Paths remain separate spawn arguments, including the consumer, loader URL and working directories containing spaces. No shell quoting, source/global QA fallback, production launch timeout increase or audit retry was introduced.

browser-environment.json records the consumer executable, previous automatic selection and memory/load. browser-probe.log records the real CDP browser/protocol version, startup duration, PID and owned Chrome cleanup. Lab 13 invocation files now record CHROME_PATH and resource readings. Each scenario writes score-diagnostics.json before the score assertion, retaining individual scanner scores, findings and Lighthouse metrics; the assertion also prints the scored checks. Reports and strict 100/96/100 scores, exits 0/2/0, FULL confidence and 100% coverage remain mandatory.

Local Windows Node 22.14.0 validation passed: build; 282 source tests (0 failures, 0 skipped); Lab 11 scores/exits 100/0, 94/2, 100/0; Lab 12 100/0, 96/2; Lab 13 100/0, 96/2, 100/0. Lab 13's selected Chromium CDP startup was 732 ms; probe cleanup, temporary-directory removal and source hash checks passed. Local discovery evidence shows system Google Chrome was previously selected instead of consumer Chromium. This verifies the selection defect and local mitigation; the exact transient cause of the earlier hosted Windows timeout still requires its original Chrome stderr/resource evidence. The current matrix workflow remains unchanged and must be rerun on hosted Windows/macOS to validate the correction there.

macOS is **not diagnosed or fixed yet**. Public Actions metadata confirms its failure, but the artifact download requires authentication (HTTP 401). The supplied local folder C:\Users\Dell\Downloads\lab13-package-macos-latest was not found, including an unrestricted read. A readable clean report.json and clean.log are required to identify the precise scanner, finding, severity and metric behind 99. No scoring change is justified by the aggregate number alone. The current overall calculation in src/core/report.ts averages scored PASS/FAIL/WARNING results (and numeric PARTIAL results), counting exact names SEO, Lighthouse, Accessibility and Performance twice, then rounds. Lighthouse Performance has weight one because that exact name is not in the doubled-name set. Do not infer a Lighthouse problem from 99 without the report, or modify weights/expectations to pass this fixture. Once the artifact is available, inspect every numeric score below 100, its data/metadata and Lighthouse route metrics, then reproduce the actual weighted sum. Hosted macOS diagnosis and the next Windows/macOS matrix runs remain outstanding.

## Troubleshooting checks

- Missing npm: inspect environment.json and set npm_execpath; do not substitute a global QA Check executable.
- Permission/browser-library failure: inspect install/browser-install and scan logs; use native dependencies appropriate to the OS. Do not disable Lighthouse or PDF to pass.
- Path failure: inspect the failing *-invocation.json, which preserves exact arguments and cwd. Do not replace spaced paths with simple paths to hide failure.
- macOS containment mismatch: compare canonical private paths; do not weaken the consumer-isolation loader.
- Score, coverage, timeout or regression mismatch: keep the failure and compare real JSON evidence. Do not overwrite expected scores, raise budgets without diagnosis or force a gate.
- Cleanup failure: inspect results.json/cleanup errors and private path ownership before retrying. Do not kill processes by generic names or delete a shared temporary directory.
