# Proposed QA Check CLI 2.0.0 release readiness

Prepared 2026-10-25 on codex/lighthouse-13-5-experiment, based on 4ac2831.
The maintainer reports all five hosted workflows passed at that commit. Proposed
2.0.0 metadata and the changes below are not yet hosted-validated or published.

## Scope and review

The existing uncommitted README changes were reviewed before editing: they replaced
two Node 20 claims with the experimental Node 22.19+ requirement. That intent is
preserved and promoted to the proposed v2 release contract. An outdated README
stable-version assertion was replaced with an explicit unpublished proposal.

Package version, top-level lockfile version and root package lock entry move together
from 1.3.0 to 2.0.0. engines.node stays >=22.19; Lighthouse and every dependency
range/resolution are unchanged. The bin reads installed metadata dynamically.
No exports map or library API is introduced. Scanner behavior, scoring, report
formats, baselines and the lab14-v1 security gate are unchanged.

Two packaging gaps identified in earlier labs are addressed: prepack builds the
compiled output, and LICENSE supplies the declared MIT terms using the existing
README/package author. The only runtime-facing compatibility change is the generated
init workflow's Node 20 -> 22.19.0 default; existing user workflows stay untouched.

Labs 12–14 now pass --foreground-scripts=false to JSON pack commands. This keeps
lifecycle banners separate from machine-readable output without disabling prepack.
Build failures remain nonzero and prevent packing, as verified by the negative
build proof below. No harness assertions or release gates were weakened.

## Validation

Final local results on Windows x64, 2026-10-25:

| Check | Runtime | Result |
| --- | --- | --- |
| npm ci and explicit build | Node 22.19.0 | PASS; install audit also reported zero findings |
| Full source suite | Node 22.19.0 | 301 passed, 0 failed, 0 skipped |
| Full source suite, final rerun | Node 24.22.0 | 301 passed, 0 failed, 0 skipped |
| Security policy suite | Node 22.19.0 and 24.22.0 | 2 passed each |
| Readiness isolation retest | Node 24.22.0 | 26 passed, 0 failed/skipped |
| Lab 11 | Node 22.19.0 | PASS; clean/regression/recovery 100/94/100; exits 0/2/0 |
| Lab 12 | Node 22.19.0 | PASS; clean/defect 100/96; exits 0/2 |
| Lab 13 | Node 22.19.0 | PASS; clean/defect/recovery 100/96/100; exits 0/2/0 |
| Lab 14 | Node 22.19.0 | PASS; functional and security gates PASS; harness exit 0 |
| Fresh packed runtime contracts | Node 22.19.0 and 24.22.0 | PASS; real tarball installed externally, help/version succeed |
| Unsupported packed runtime | Node 20.20.2 | Version/help/scan rejected with exit 1 before initialization; strict installation rejected with EBADENGINE |
| Path-isolation tests | Node 22.19.0 | 14 passed |
| Source production audit | Node 22.19.0 | 0 info/low/moderate/high/critical findings |
| Installed consumer production audit | Node 22.19.0 | 0 info/low/moderate/high/critical findings |
| Prepack positive proof | Node 22.19.0 | Builds missing dist in an isolated source staging tree |
| Prepack negative proof | Node 22.19.0 | Intentional temporary TS compilation error returns 2 and prevents tarball creation |
| GitHub Actions syntax | actionlint | All five existing workflows and generated init workflow pass; optional ShellCheck/Pyflakes integrations unavailable and disabled |
| git diff --check | Current working tree | PASS |

The first Node 24 full suite ran 301 tests: 300 passed, one failed, zero skipped.
The failure was the existing real-browser readiness test expecting one completed
authenticated route; both routes timed out under its existing budgets. Its code,
timeouts and assertions were not changed. The complete readiness file subsequently
passed 26/26 in isolation, and the unchanged full source suite passed 301/301.
This demonstrates an intermittent local failure, not a proven causal link to the
version change; retain the failed attempt as reliability evidence. The first
prepack diagnostic also exposed lifecycle banners mixed with JSON; the three pack
harness commands were corrected and the final independent positive/negative proof
passed. The original diagnostic runner had already loaded its old argument list
and retained a JSON parsing failure, which is preserved separately from final results.

All final scenario scans retain 100% coverage and FULL confidence. Clean/recovery
gates pass; deliberately defective scans and regression comparisons retain their
expected failures. HTML, JSON, Markdown and PDF reports were verified. Lab 14's
high/critical and incomplete-audit security policy is unchanged, with no exceptions.
Temporary consumers, owned child processes/browsers and build-proof staging trees
were cleaned up; package harnesses verified the source was unchanged during runs.

## Package and security evidence

The actual installed package, CLI output, root manifest, both root lockfile version
fields and current release documentation identify 2.0.0. A structured comparison
with HEAD confirms every non-root dependency lock entry is unchanged.

The final dry pack matches the integrity of the actual tarballs installed by Labs
12, 13 and 14: **160 files, 151,818 bytes compressed, 639,575 bytes unpacked**.
Contents are bin/qa-check.js, 156 compiled dist JavaScript files, package.json,
README.md and LICENSE. Source/tests, reports, fixtures, node_modules, browser
binaries, lockfiles, .env files and temporary artifacts are excluded. The existing
pack allowlist/common-secret checks passed; this is not a comprehensive secret audit.
CHANGELOG.md and release notes are repository documentation, not packaged files.

Integrity: `sha512-Bh84x/JZO0rfWdXlaQwMgvrZkzH0aTT7Q3jfrMkjQtE2IjWZk80uVqEvcpIAgsQIJSkCGkMTUwPK6/kfhDgZyA==`.

Production findings remain zero in both source and consumer graphs. This preparation
does not claim new dependency remediation: the Lighthouse/tinyglobby fixes were
already present in 4ac2831. No dependency ranges/resolutions, overrides, audit
thresholds or allowlists changed. The OpenTelemetry deprecation warning seen during
installation is recorded; it is not an npm audit finding. Advisory checks are dated
evidence, not a guarantee against unknown security defects.

Public registry preflight returned latest 1.1.5 and no published 2.0.0. This check
does not reserve a version; repeat it before a separately authorized publication.

Raw evidence is under ignored test-reports/v2-release/: results.json preserves the
first attempts, source-22/source-24 and policy logs, registry output and copied full
Lab 11–14/runtime reports. final/results.json records the independent retests and
expected negative-build result; final/package-manifest.json contains every path,
mode, size and integrity; final/metadata.json verifies version/dependency consistency;
final/prepack-proof.json and cleanup.json record hook behavior and cleanup. Audit
JSON and trees are retained in lab14/reports/win32/. No logs were edited into success.

## Recommendation

**READY for maintainer review and another hosted CI run; publication remains pending
approval.** No final local functional or production-security blocker remains. New
2.0.0 packaging/lifecycle/template changes still need all five workflows on the
approved commit; hosted success at 4ac2831 establishes the migration baseline only.
The earlier local timing failure remains a reliability caveat for that CI review.

## Approval and remaining release steps

Do not publish based only on a local result. Review all changes, the license author
notice and proposed major version; manually approve committing/pushing this branch,
then rerun all five hosted workflows on that approved commit. Existing hosted
success applies to 4ac2831. Registry version availability must be rechecked, and npm
account/release authorization verified, before any separately approved publication.

Historical lab records retain their original versions and results; this document,
the README, CHANGELOG.md and releases/v2.0.0.md describe the current proposal.

## Manual approval commands

These commands are provided for the maintainer to review and execute only after
approving the changes. They do not merge, tag or publish. A push triggers the five
existing workflows for this branch. Wait for those workflows on the new commit
before making a separate publication decision.

```powershell
Set-Location 'C:\Users\Dell\Desktop\-QA-Check-CLI'
if ((git branch --show-current).Trim() -ne 'codex/lighthouse-13-5-experiment') { throw 'Unexpected branch' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff whitespace check failed' }
git diff -- README.md package.json package-lock.json src/core/init.ts docs/lab12-package-readiness.md docs/lab14-release-readiness.md tests/integration/lab12-package.mjs tests/integration/lab13-platform.mjs tests/integration/lab14-release.mjs
Get-Content LICENSE, CHANGELOG.md, docs/releases/v2.0.0.md, docs/v2-release-readiness.md, src/tests/initRuntime.test.ts

# Only after approving the reviewed files:
$releaseFiles = @(
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'CHANGELOG.md',
  'src/core/init.ts', 'src/tests/initRuntime.test.ts',
  'docs/releases/v2.0.0.md', 'docs/v2-release-readiness.md',
  'docs/lab12-package-readiness.md', 'docs/lab14-release-readiness.md',
  'tests/integration/lab12-package.mjs', 'tests/integration/lab13-platform.mjs',
  'tests/integration/lab14-release.mjs'
)
git add -- $releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged diff check failed' }
git diff --cached --stat
git diff --cached
# Review the staged diff before running the following two commands.
git commit -m "chore: prepare QA Check CLI 2.0.0 release candidate"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push -u origin codex/lighthouse-13-5-experiment
```

To repeat local validation, select Node 22.19+ first. The default node executable
observed on this machine was 22.14.0 and is unsupported. These runs selected the
cached supported executable explicitly. For this machine, or substitute your own
supported installation:

```powershell
$releaseNode = 'C:\Users\Dell\AppData\Local\npm-cache\_npx\992a19d7d9bf36d4\node_modules\node\bin\node.exe'
$env:Path = (Split-Path -Parent $releaseNode) + ';' + $env:Path
$env:npm_execpath = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
```

Then run from the repository root:

```powershell
node --version
npm ci
npm run build
npm test
node --test tests/integration/release-security.test.mjs
npm pack --dry-run --json --foreground-scripts=false
npm audit --omit=dev --json
node tests/integration/lab11-cicd.mjs
node tests/integration/lab12-package.mjs
node tests/integration/lab13-platform.mjs
node tests/integration/lab14-release.mjs
git diff --check
```

Lab 11 resolves npm through npm_execpath when a standalone Node executable has no
adjacent npm installation; set that variable to the installed npm/bin/npm-cli.js.
Browser downloads and registry access are required. Preserve test-reports output
on failure and do not proceed with a failed functional or security gate.
