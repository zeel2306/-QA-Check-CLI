# Runtime readiness and large projects

QA Check separates server selection and readiness, shared browser evidence collection, and scanner evaluation. Static checks execute before runtime preparation. The first applicable runtime check waits for readiness and the bounded shared browser pass; its scanner evaluation deadline starts afterwards. Preparation and execution durations are reported separately.

An explicit `--url` or configured `url`/`baseUrl` is a user-selected target. An optional application identity marker can validate that selection. Automatic discovery reads supported port values from package scripts, Angular/Vite/Nuxt configuration, `.env` port/APP_URL entries, and framework defaults. Reading configuration never changes the target application's environment.

Automatic reuse requires a configured identity marker or OS evidence connecting the listening PID to the project's absolute directory. A framework name, title, HTTP success, or matching port is insufficient. On Windows, the listening process command must reference the project directory; on Linux, the process working directory can be checked when `lsof` and `/proc` are available. Insufficient permissions/evidence cause isolated startup, rather than guessing. Existing servers are EXTERNAL and never stopped by QA Check.

Owned servers use an available ephemeral port, framework/package scripts and the detected package manager. Laravel uses Artisan; Next uses its dev script or installed Next CLI; Vite uses preview for built output or development otherwise; Angular/Nuxt use development scripts; native Node scripts retain their behavior; static HTML uses the existing static server. Fallback framework commands use `npx --no-install`: dependencies are never installed automatically. Custom commands must honor the selected port/host arguments or `PORT`/`HOST`; a command that hardcodes another port may fail readiness rather than silently scanning that other service.

The lifecycle is PROJECT_DETECTED → SERVER_DISCOVERY → VERIFY_IDENTITY → START_SERVER (when needed) → WAIT_FOR_READINESS → APPLICATION_READY → STOPPED. Failure states are BLOCKED or CANCELLED. HTTP readiness uses a configured health path/status contract. Browser-facing applications also require DOM navigation and checks for known compilation/error overlays. The shared route pass retries transient compilation/navigation errors, uses bounded batches, preserves completed findings, and reports timed-out, blocked and untested routes. Polling/analytics/WebSockets do not need to finish.

Put settings in `qa-check.config.json`:

```json
{
  "runtime": {
    "startupTimeoutMs": 300000,
    "readinessTimeoutMs": 300000,
    "pollingIntervalMs": 2000,
    "browserLaunchTimeoutMs": 30000,
    "initialNavigationTimeoutMs": 60000,
    "navigationTimeoutMs": 30000,
    "routeTimeoutMs": 240000,
    "compilationRetries": 2,
    "browserConcurrency": 2,
    "browserAuditTimeoutMs": 1200000,
    "scanTimeoutMs": 3600000,
    "scannerTimeoutMs": 120000,
    "minimumRouteCoveragePercent": 0,
    "scannerTimeouts": { "SEO": 120000, "Accessibility": 120000 },
    "candidateUrls": ["http://127.0.0.1:3000"],
    "healthPath": "/health",
    "expectedStatuses": [200],
    "identity": { "path": "/health", "json": { "application": "my-application" } }
  }
}
```

Only configure an identity marker your application actually exposes. A `text` marker can replace the `json` marker; JSON keys may use dotted paths. Marker response size and request time are bounded. Marker bodies, environment values and process command lines are not copied into runtime report diagnostics. Only evidence descriptions and listening PIDs are reported.

Defaults: local startup/readiness 300 seconds each; CI 90 seconds each; CI browser evidence 300 seconds and overall scan 900 seconds. Other defaults are shown above. Timings must be positive integers at most one hour; concurrency is 1–8 and retries 0–5. Existing `lighthouseBudgetMs` separately controls its 90-second default global budget (maximum 150 seconds). Broken Links retains its separate bounded verification budget after discovery. Explicit scanner overrides take priority over built-in scanner deadlines. Readiness/scanner deadlines are independent; the overall deadline covers their combined execution.

```powershell
qa-check . --profile full
qa-check . --url http://127.0.0.1:3000 --profile full
qa-check . --profile full --route / --route /products/42
qa-check . --ci --profile ci
```

The existing CLI flags retain their meaning. CI adds no interactive prompts. Ctrl+C cancels readiness/browser work and cleans owned processes; externally managed servers remain alive. Programmatic callers can supply an AbortSignal.

Set `runtime.minimumRouteCoveragePercent` to a value from 0–100 to enforce route coverage in the current quality gate (for example 95 in CI). Zero disables this additional threshold. This gate remains independent of the regression gate.

Parameterized declarations are discovered but no parameter values are invented. Supply representative concrete URLs with `includeRoutes` or `--route`, plus configured authentication when required. Authentication is applied to initial readiness, ordinary page inspection and all responsive viewports. Discovered route inventory and selected route scope are reported separately. Intentional selection does not imply that all application routes were tested.

Scanner execution coverage differs from route coverage. A scanner with valid but incomplete evidence reports PARTIAL unless confirmed defects require FAIL; incomplete FAIL scopes are explicitly marked and remain incomparable for baseline scoring. Infrastructure-only failures have no fabricated score or canonical application defects. Runtime HTML/JSON/terminal diagnostics show ownership, timings, actual route coverage, and reasons for incompleteness. Partial/new/changed scope is never equated with a complete compatible baseline.

The reported historical “12,000 ms SEO skip” cannot be tied to a literal deadline in this revision without its original log. This source has a 120,000 ms default scanner deadline, legacy 30/45-second startup waits and a former 15-second shared per-route deadline. More significantly, startup and shared browser work previously ran inside the first scanner's deadline, and SEO swallowed runtime failures. Those verified defects are fixed here; the exact historical 12-second trigger remains unconfirmed.
