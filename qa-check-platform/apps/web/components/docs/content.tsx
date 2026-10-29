import type { ReactNode } from "react";
import Link from "next/link";
import { CodeBlock } from "./code-block";
import { docsHref, docsNavigation, sourceLinks } from "./navigation";
import styles from "./docs.module.css";
import type { DocumentationPage } from "./types";
import { supportDocumentation } from "./support-content";
import { CommandBuilder } from "./command-builder/command-builder";
export type { DocumentationPage } from "./types";

function Note({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.callout}>
    <strong>{title}</strong>
    <p>{children}</p>
  </div>;
}

function Table({ headings, rows, label }: { headings: string[]; rows: string[][]; label: string }) {
  return <div className={styles.tableWrap} role="region" aria-label={label} tabIndex={0}>
    <table>
      <thead>
        <tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr>
      </thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

const auditFlags = [
  ["--profile report|ci|strict|fast|full", "Select a profile. All five values are accepted by the source, although help lists only report, ci, and strict."],
  ["--ci", "Return the audit's quality-gate exit code. Local audit mode otherwise prints next-command suggestions."],
  ["--fail-on error|warning|none", "Choose the CI failure policy; default: error. This changes exit behavior, not whether findings appear in reports."],
  ["--min-score <0–100>", "Minimum overall score for the CI exit rule; default: 0."],
  ["--html / --no-html", "Enable or disable index.html; enabled by default."],
  ["--json / --no-json", "Enable or disable report.json; enabled by default."],
  ["--markdown / --md / --no-markdown / --no-md", "Enable or disable report.md; enabled by default."],
  ["--pdf / --no-pdf", "Enable or disable report.pdf; enabled by default. PDF generation errors are logged."],
  ["--output <directory>", "Report directory, resolved against the detected project; default: reports."],
  ["--url <url> / --base-url <url>", "Use an explicit application URL for runtime checks. The target must be available and match the project."],
  ["--route <route> / --include-route <route>", "Include routes. Repeat the option or supply comma-separated values."],
  ["--ignore-route <route>", "Exclude routes. Repeat the option or supply comma-separated values."],
  ["--max-routes <positive integer>", "Limit route selection. Configuration may also define a route limit."],
  ["--baseline <report.json>", "Compare against a previous JSON report. Relative audit baseline paths resolve against the detected project."],
  ["--no-baseline", "Disable automatic baseline comparison with the previous report. An explicit --baseline still selects that file."],
  ["--history / --no-history", "Enable or disable local report history; enabled by default."],
  ["--history-limit <positive integer>", "Maximum retained history snapshots; default: 30."],
  ["--lighthouse-route-timeout-ms <integer>", "Per-route Lighthouse timeout: 1–120000ms; default: 45000ms."],
  ["--lighthouse-budget-ms <integer>", "Total Lighthouse budget: 1–600000ms."],
  ["--debug", "Enable debug output and QA_CHECK_DEBUG=1 for this process."],
];

const commandDetails = [
  { id: "init", title: "Initialize a project", syntax: "qa-check init [project-path]", flags: "No command-specific flags.", example: "qa-check init .", behavior: "Creates qa-check.config.json and .github/workflows/qa-check.yml if missing. Existing files are skipped. Review the generated configuration and workflow before using them; the starter includes a sample external API test." },
  { id: "fix", title: "Preview or apply fixes", syntax: "qa-check fix [project-path] [--dry-run]", flags: "--dry-run previews changes without writing them. autofix is an alias for fix.", example: "qa-check fix . --dry-run", behavior: "Runs the debug-statement and HTML accessibility/meta fixers over supported source files. Without --dry-run, it writes fixes to disk. It is not a general-purpose repair for every reported issue; review any applied changes." },
  { id: "doctor", title: "Diagnose the environment", syntax: "qa-check doctor [project-path]", flags: "No command-specific flags.", example: "qa-check doctor .", behavior: "Checks Node, Git context, framework, browser package availability, tooling, configuration, and report-directory permissions. It creates reports/ if needed and writes then deletes a permission-test file. Returns 1 when diagnostics contain FAIL. A positive browser-package check is not a guarantee that a browser audit will launch." },
  { id: "compare", title: "Compare reports", syntax: "qa-check compare [baseline.json] [current.json]", flags: "No command-specific flags.", example: "qa-check compare reports/baseline.json reports/report.json", behavior: "With two readable reports, prints score trends, issue changes, and a regression quality gate; returns 0 when it passes and 1 when it fails. With one readable file (or no arguments, using reports/report.json), prints its score and says no baseline was found. It does not automatically locate a second historical report." },
  { id: "api", title: "Test configured API endpoints", syntax: "qa-check api [project-path]", flags: "No command-specific flags. Reads the api configuration from qa-check.config.json.", example: "qa-check api .", behavior: "Runs configured HTTP requests and prints endpoint results. It checks expected HTTP status, optional response-time limits, and required JSON fields. With no cases it prints a configuration message. The standalone command sets exit code 1 when the aggregate result is FAIL. Requests can mutate targets if methods such as POST or DELETE are configured; only test endpoints you control." },
  { id: "test", title: "Run configured user flows", syntax: "qa-check test [project-path]", flags: "No command-specific flags. e2e is an alias for test.", example: "qa-check test .", behavior: "Loads flows from qa-check.config.json, starts the pipeline runtime, optionally authenticates using existing CLI config, and prints flow/step results. With no flows it prints a configuration message. Requires browser/runtime readiness and returns 1 when the aggregate result is FAIL." },
  { id: "flow", title: "Run a flow file or directory", syntax: "qa-check flow [file.json|file.yml|directory]", flags: "No command-specific flags; JSON, .yaml, and .yml files are discovered in the target directory.", example: "qa-check flow flows/smoke.json", behavior: "Loads a flow object, array, or { flows: [...] } wrapper. YAML support uses a small custom parser, not a complete YAML implementation; prefer JSON for nested flows. Falls back to flows in the current directory's configuration if the target has none. Runtime and configuration for this command use the current working directory; returns 1 when the aggregate result is FAIL." },
];

const coreDocumentation: DocumentationPage[] = [
  {
    slug: "", title: "A clearer path to quality.", eyebrow: "QA CHECK / DOCUMENTATION",
    description: "Start with a local audit. Understand the evidence. Build software with a little more confidence.",
    sections: [
      {
        id: "meet-qa-check", title: "Meet QA Check CLI", body: <>
          <p>QA Check CLI is an open-source, framework-aware developer tool. It detects your project, selects a QA pipeline, and runs checks for areas such as code quality, accessibility, performance, SEO, and responsive behavior.</p>
          <p>It runs locally and generates reports you can inspect and share. Which checks run depends on the detected framework, project configuration, available tools, and runtime readiness.</p>
          <Note title="Two products, different stages">The CLI is published on npm. QA Check Platform is a separate web application in development. These docs do not imply that a hosted SaaS dashboard has launched.</Note>
        </>
      },
      {
        id: "quick-start", title: "Your first audit", body: <>
          <p>Use Node.js <strong>22.19.0 or newer</strong>. Install the CLI, confirm the version, then run the audit from your project directory after installing that project's own dependencies.</p>
          <CodeBlock label="Quick start" code={'npm install -g qa-check-cli\nqa-check --version\nqa-check . --profile report'} />
          <p>The report profile keeps QA findings from failing the quality-gate exit rule. Setup errors and interrupted runs can still fail. Reports default to the detected project's <code>reports/</code> folder.</p>
          <p>New environment? Follow <Link href="/docs/installation">the installation guide</Link> before your first browser audit.</p>
        </>
      },
      {
        id: "explore-guides", title: "Find your next step", body: <div className={styles.cards}>{docsNavigation.filter(page => page.slug).map(page => <Link key={page.slug} href={docsHref(page.slug)}>
          <small>{page.label} ↗</small>
          <strong>{page.title}</strong>
          <p>{page.description}</p>
        </Link>)}</div>
      },
      {
        id: "platform-and-source", title: "The platform & the source", body: <>
          <p>The platform is intended to bring projects, uploaded CLI JSON reports, scan history, and findings into a web workspace. In this application, those workflows are <strong>planned, not available</strong>. Read the <Link href="/docs/platform">platform status guide</Link> for the current boundary.</p>
          <p>Explore the <a href={sourceLinks.github}>GitHub repository</a> or the <a href={sourceLinks.npm}>npm package</a>. Documentation here is checked against the repository's CLI v2.0.0 implementation; installed versions may differ. Run <code>qa-check --version</code> and <code>qa-check --help</code> when troubleshooting.</p>
        </>
      },
    ],
  },
  {
    slug: "installation", title: "Install your quality toolkit.", eyebrow: "GETTING STARTED / INSTALLATION",
    description: "Set up QA Check CLI on your machine and make sure your project is ready for an audit.",
    sections: [
      {
        id: "requirements", title: "Requirements", body: <>
          <Table label="CLI requirements" headings={["Requirement", "Details"]} rows={[["Node.js >=22.19.0", "Verified from package.json engines.node and the runtime version guard. Node 20 and earlier Node 22 versions are rejected. Node 24 satisfies the requirement."], ["npm", "Used to install and run the CLI. Check node --version and npm --version before installing."], ["Browser tooling", "Google Chrome is required for Lighthouse. Playwright Chromium is used by browser-based checks and must be available for those checks."], ["Project toolchain", "Install the audited project's dependencies. Framework pipelines may also need native tools such as PHP/Composer, Flutter, .NET, or Java."]]} />
          <CodeBlock label="Check prerequisites" code={'node --version\nnpm --version'} />
        </>
      },
      {
        id: "global-install", title: "Install globally", body: <>
          <CodeBlock label="Global installation" code={'npm install -g qa-check-cli\nqa-check --version\nqa-check --help'} />
          <p>The package is named <code>qa-check-cli</code>; the executable is <code>qa-check</code>. With no arguments, the executable shows help. To audit the current directory, pass <code>.</code>.</p>
        </>
      },
      {
        id: "local-usage", title: "Use it in a project", body: <>
          <p>Run from the project you want to audit, with its dependencies already installed. Use <code>npx</code> for package-based execution, or install the CLI as a development dependency for repeatable project usage.</p>
          <CodeBlock label="Project-local installation" code={'npm install --save-dev qa-check-cli\nnpx qa-check-cli --version\nnpx qa-check-cli . --profile report'} />
          <p>Without a local installation, <code>npx qa-check-cli . --profile report</code> can resolve the package from npm and may prompt to install it. Review the selected version before proceeding.</p>
          <CodeBlock label="Environment diagnostics" code="qa-check doctor ." />
          <p>When the audit completes, inspect <code>reports/index.html</code> and <code>reports/report.json</code>. See <Link href="/docs/reports">the reports guide</Link> for the other outputs.</p>
        </>
      },
      {
        id: "browser-setup", title: "Prepare browser checks", body: <>
          <p>Install Google Chrome for Lighthouse. If Playwright reports a missing Chromium executable, use its browser installer. Run this from a project with the matching Playwright package available; <code>npx</code> can otherwise download a different package version.</p>
          <CodeBlock label="Playwright browser setup" code="npx playwright install chromium" />
          <p>Some Linux environments also need browser system libraries; the CLI's generated CI workflow uses <code>npx -y playwright install --with-deps chromium</code>. Check your environment rather than assuming a doctor result proves browser readiness.</p>
        </>
      },
      { id: "common-issues", title: "Common installation issues", body: <Table label="Installation troubleshooting" headings={["Symptom", "What to check"]} rows={[["Node version rejected", "Upgrade to Node >=22.19.0, open a new terminal, and check node --version. Version managers may leave an older executable on PATH."], ["qa-check not recognized", "Restart the terminal and ensure npm's global executable directory is on PATH. npm config get prefix shows its prefix; on PowerShell use Get-Command qa-check. npx qa-check-cli --help is an alternative."], ["PowerShell blocks npm.ps1", "Use npm.cmd and npx.cmd for these commands; use qa-check.cmd for a global npm shim. No execution-policy change is required."], ["Global install permission error", "Check your npm prefix and use a user-managed Node installation or a project-local development dependency."], ["Missing browser or tool", "Install the required Chrome/Playwright browser or framework tool. An unavailable scanner is not a successful check."], ["Report directory not writable", "Choose a writable directory with --output and check permissions. doctor tests the default reports directory."]]} /> },
    ],
  },
  {
    slug: "commands", title: "The command reference.", eyebrow: "CLI / REFERENCE",
    description: "Actual entry points, flags, profiles, and exit behavior from the current CLI implementation.",
    sections: [
      {
        id: "audit", title: "Run a quality audit", body: <>
          <p>Prefer a guided setup? Use the <Link href="/docs/command-builder">interactive Command Builder</Link> to assemble verified options for your own terminal.</p>
          <CodeBlock label="Audit syntax" code="qa-check [project-path] [options]" />
          <p>Pass a path to audit a project. No arguments, <code>--help</code>, <code>-h</code>, and <code>help</code> show help instead. <code>qa-check --version</code> prints the installed package version. Put help/version at the start; subcommands do not implement independent help parsers.</p>
          <CodeBlock label="Audit examples" code={'qa-check . --profile report\nqa-check . --ci --profile strict --output reports\nqa-check . --route / --route /about --ignore-route /admin --max-routes 20\nqa-check . --no-pdf --no-history'} />
          <p>An audit detects the framework, executes its pipeline, writes enabled reports, and usually saves history. It may start project scripts or make requests to the selected application. Audit only projects and targets you control.</p>
          <Table label="Audit options" headings={["Flag", "Behavior"]} rows={auditFlags} />
          <Note title="Options are not shared across subcommands">The general audit flags are parsed only for normal audits. init, fix, doctor, compare, api, flow, and test return through separate handlers. Do not append audit flags to those commands and expect them to apply.</Note>
        </>
      },
      {
        id: "profiles", title: "Profiles & exit codes", body: <>
          <Table label="Profile behavior" headings={["Profile", "Implemented behavior"]} rows={[["report", "failOn=none, minScore=0. No CI mode is enabled by the profile."], ["ci", "Enables CI mode; failOn=error, minScore=0."], ["strict", "Enables CI mode; failOn=warning, minScore=80."], ["fast", "Accepted by the parser; failOn=none, minScore=0. Runtime/check code may reduce scan scope. Treat resulting evidence as limited."], ["full", "Accepted by the parser; failOn=error, minScore=0. Does not by itself enable CI mode."]]} />
          <p>Normal audits apply defaults, configuration, a CLI-selected profile, then explicit flags. The configured profile also contributes defaults. In CI mode, <code>getExitCode</code> evaluates the numeric score threshold first, then scanner statuses:</p>
          <Table label="Audit CI exit codes" headings={["Code", "Meaning"]} rows={[["0", "No configured exit-rule failure (or failOn=none with no minimum-score failure)."], ["1", "WARNING when failOn=warning."], ["2", "FAIL, ERROR, PARTIAL, TIMEOUT, or BLOCKED when failOn is not none."], ["3", "Overall score below a nonzero minimum."], ["130", "An interrupted audit preserves the cancellation exit code."]]} />
          <p>Fatal setup errors also return a nonzero code, even in report-only mode. The report's <code>currentQualityGate</code> is separate from the exit-code function; review its reasons and coverage rather than using an exit code as proof of complete coverage.</p>
        </>
      },
      ...commandDetails.map(command => ({
        id: command.id, title: command.title, body: <>
          <CodeBlock label={`${command.id} syntax`} code={command.syntax} />
          <p>{command.behavior}</p>
          <p>
            <strong>Flags:</strong> {command.flags}</p>
          <CodeBlock label={`${command.id} example`} code={command.example} />
        </>
      })),
      {
        id: "api-configuration", title: "API configuration example", body: <>
          <p>Save this shape in <code>qa-check.config.json</code>, replacing the URL with an endpoint you control. This example expects an existing JSON health endpoint; it does not create one.</p>
          <CodeBlock label="API configuration JSON" code={JSON.stringify({ api: [{ name: "Local health", method: "GET", url: "http://localhost:4000/api/health", expect: { status: 200, responseTime: 2000, requiredFields: ["status"] } }] }, null, 2)} />
          <p>Required fields are checked as top-level JSON keys. Other supported configuration includes headers and body; keep credentials out of committed configuration and shared reports.</p>
        </>
      },
      {
        id: "flow-configuration", title: "Flow configuration example", body: <>
          <p>The configured-flow commands read a <code>flows</code> array. For file-based execution, save the same JSON as <code>flows/smoke.json</code>. A reachable application and Playwright browser are required.</p>
          <CodeBlock label="Flow configuration JSON" code={JSON.stringify({ flows: [{ name: "Home page", steps: [{ goto: "/" }] }] }, null, 2)} />
          <p>See the repository for the complete flow action types. This guide does not introduce or configure platform authentication.</p>
        </>
      },
      { id: "source-contract", title: "Where these commands come from", body: <p>Command dispatch and flag parsing are in <code>src/index.ts</code>. Supporting implementations are in <code>src/core/profile.ts</code>, <code>src/core/init.ts</code>, <code>src/core/doctor.ts</code>, <code>src/fixers/runner.ts</code>, <code>src/baseline/cli.ts</code>, <code>src/checks/api.ts</code>, <code>src/checks/e2e.ts</code>, and <code>src/core/flowLoader.ts</code> in the <a href={sourceLinks.github}>CLI repository</a>. Existing help is useful but does not list every accepted alias or profile.</p> },
    ],
  },
  {
    slug: "reports", title: "Read the evidence, not just the score.", eyebrow: "GUIDES / REPORTS",
    description: "Understand report files, scanner results, coverage, and the findings that deserve your attention.",
    sections: [
      {
        id: "report-files", title: "Report formats & locations", body: <>
          <p>Normal audits enable all four formats by default. The output directory defaults to <code>reports/</code> under the detected project; use <code>--output</code> to change it.</p>
          <Table label="Report output files" headings={["File", "Purpose"]} rows={[["report.json", "Structured AuditReport object, serialized with indentation. Suitable for programmatic inspection and CLI baseline comparison."], ["index.html", "Local HTML dashboard report. Keep its related screenshots/assets together when sharing the report folder."], ["report.pdf", "PDF report for portable review. Generation failures are logged and can leave this file absent."], ["report.md", "Markdown summary for text-based review. --md is an alias for --markdown."]]} />
          <CodeBlock label="Report selection" code={'qa-check . --profile report --json --html --markdown --pdf\nqa-check . --profile report --no-pdf --output audit-reports'} />
          <p>Local CLI history is enabled by default in <code>reports/history/</code>, with a default limit of 30 snapshots. That local history exists independently of the planned platform scan history.</p>
        </>
      },
      {
        id: "json-contract", title: "The JSON contract", body: <>
          <p>The current report interface declares <code>version: 2</code>. The JSON writer serializes the report object; optional fields may be absent. This is a field guide, not a fabricated scan.</p>
          <Table label="Verified report fields" headings={["Field", "Meaning"]} rows={[["projectPath, framework, pipeline", "Audited project context and selected execution pipeline."], ["startedAt, finishedAt, duration", "Execution timestamps and duration."], ["routes, checksExecuted, checksSkipped", "Recorded scope and scanner execution lists. checksNotApplicable is optional."], ["overallScore", "Rounded numeric overall score, interpreted alongside evidence and coverage."], ["results", "Scanner CheckResult entries: name, status, duration, optional category, score, message, issues, data, error, skipReason, and coverage details."], ["scoreEvidence (optional)", "Evidence status, observedScore, missingScanners, and an optional warning."], ["coverage (optional)", "Applicable scanners, successful execution count, skipped/errors, coveragePercent, and optional partial/timeout/blocked counts."], ["currentQualityGate (optional)", "passed, status, reasons, failing checks, and optional confidence and other scanner lists."], ["baseline, history (optional)", "Comparison evidence and local trend information when enabled and available."]]} />
          <p>Normalized issues can include <code>code</code>, <code>category</code>, <code>severity</code>, <code>message</code>, source check name, location, fingerprint, and optional suggestion. Scanner-specific <code>data</code> is not a single universal shape. Do not assume every finding has a file, line, selector, or URL.</p>
        </>
      },
      {
        id: "statuses", title: "Scanner statuses", body: <>
          <Table label="Supported scanner statuses" headings={["Status", "How to interpret it"]} rows={[["PASS", "The scanner completed with a passing result for its tested scope."], ["FAIL", "The scanner completed and found a failing condition."], ["WARNING", "The scanner reported a warning. Review its message and findings."], ["SKIPPED", "The check was not performed. Read skipReason/message; this is not proof of quality."], ["ERROR", "Execution encountered an error. Inspect error details and fix the environment or scanner problem."], ["NOT_APPLICABLE", "The check does not apply to this project or scope; excluded from applicable-scanner coverage."], ["PARTIAL", "Only part of the intended work completed. Review page/route coverage and incomplete-scope metadata."], ["TIMEOUT", "The check exceeded its execution budget; untested scope remains unknown."], ["BLOCKED", "Readiness or an execution prerequisite prevented verification."]]} />
          <p>Other structures use different status vocabularies. Route audits use <code>PASSED</code>, <code>FAILED</code>, <code>TIMED_OUT</code>, <code>BLOCKED</code>, and <code>SKIPPED</code>. Current quality gates use <code>PASSED</code>, <code>FAILED</code>, and <code>INCOMPLETE</code>. Do not substitute these for scanner-level statuses.</p>
        </>
      },
      {
        id: "quality-scores", title: "Scores & confidence", body: <>
          <p>In <code>src/core/report.ts</code>, the overall score averages PASS, FAIL, and WARNING results, plus PARTIAL results with a numeric score. Checks named exactly <code>SEO</code>, <code>Lighthouse</code>, <code>Accessibility</code>, and <code>Performance</code> have double weight; others have single weight. The result is rounded.</p>
          <p>A scanner's numeric score is used when present; otherwise PASS falls back to 100, WARNING to 60, and other included statuses to 0. If no results are scoreable, the overall value is 0. Excluded results do not become passing scores.</p>
          <Note title="A high score can still be provisional">scoreEvidence.status is COMPLETE, PROVISIONAL, or INSUFFICIENT_EVIDENCE. When no scanners completed, observedScore is null. Missing scanners, partial execution, and incomplete scope must be reviewed before treating a score as reliable.</Note>
          <p>Coverage counts PASS, FAIL, WARNING, and PARTIAL as executedSuccessfully, then divides that count by applicable scanners. A PARTIAL check can therefore count toward coverage without representing full route coverage. Review <code>pageSummary</code>, <code>routeAudits</code>, and quality-gate confidence too.</p>
          <p>The current gate can report FAILED for failures, execution problems, or score/coverage thresholds; INCOMPLETE for unexpected skips or partial scope without an earlier failure; and PASSED otherwise. It is not a substitute for reading the findings.</p>
        </>
      },
      {
        id: "review-findings", title: "A practical review workflow", body: <>
          <ol>
            <li>Confirm the framework, routes, and runtime match the application you intended to audit.</li>
            <li>Resolve BLOCKED, ERROR, TIMEOUT, and unexpected SKIPPED results before interpreting a clean-looking score.</li>
            <li>Read failing and warning scanner messages; use available file, URL, selector, and suggestion details to investigate.</li>
            <li>Fix and rerun with comparable scope, dependencies, and scanner versions.</li>
            <li>Use two JSON reports with <code>qa-check compare</code> to review changes. Incomparable evidence should not be treated as improvement.</li>
          </ol>
          <p>Inspect reports before sharing: they can contain project paths, URLs, screenshots, error messages, and application details. Review the available evidence rather than assuming automatic sanitization makes every artifact public-safe.</p>
        </>
      },
    ],
  },
  {
    slug: "platform", title: "The platform, honestly.", eyebrow: "PLATFORM / CURRENT STATUS",
    description: "A web workspace for quality is the direction. Here is what this application actually offers today.",
    sections: [
      {
        id: "purpose", title: "A shared home for quality", body: <>
          <p>QA Check Platform is a separate Next.js and Express application intended to help teams organize projects and review CLI audit evidence together. It does not replace the local QA Check CLI.</p>
          <Note title="Foundation in development">This branch contains a public landing page, these documentation pages, an Express health endpoint, and an empty Prisma PostgreSQL schema. It does not contain a working project dashboard, report-upload workflow, or scan-history feature. No public hosted SaaS launch is claimed.</Note>
        </>
      },
      { id: "availability", title: "Feature availability", body: <Table label="Platform feature status" headings={["Capability", "Verified availability"]} rows={[["Public landing page & documentation", "Available in this application. Introduces the product and documents the CLI."], ["Express GET /api/health", "Implemented as a service-health response. It does not prove a database connection or provide report ingestion."], ["PostgreSQL / Prisma foundation", "Configuration exists; schema has no application models. A live database connection is not established by this guide."], ["Project management", "Planned; no project creation or management UI/API is implemented here."], ["Upload CLI JSON reports", "Planned; no upload control, ingestion endpoint, or persistence is implemented here."], ["Scan history", "Planned for the platform. CLI local report history is a separate, implemented feature."], ["Quality findings & score visualization", "Planned for the platform. CLI-generated reports can already be reviewed locally."], ["Collaborative QA workflows", "Planned; team roles, assignments, comments, and collaborative review are not available here."]]} /> },
      {
        id: "planned-workflow", title: "The intended workflow", body: <>
          <ol>
            <li>
              <strong>Available:</strong> install the CLI and audit your own project locally.</li>
            <li>
              <strong>Available:</strong> generate and inspect the CLI's JSON, HTML, Markdown, or PDF output.</li>
            <li>
              <strong>Planned:</strong> create a project in the platform and upload a CLI JSON report.</li>
            <li>
              <strong>Planned:</strong> review saved scan history, scores, and findings in the web application.</li>
            <li>
              <strong>Planned:</strong> collaborate with developers and QA engineers in shared review workflows.</li>
          </ol>
          <p>There is no supported platform upload command or platform ingestion API to configure at this stage. The CLI's <code>qa-check api</code> tests endpoints you configure; it is not a report-upload command.</p>
        </>
      },
      {
        id: "use-today", title: "What you can use today", body: <>
          <p>Start with the <Link href="/docs/installation">CLI installation guide</Link>, inspect local reports with the <Link href="/docs/reports">reports guide</Link>, and explore the <a href={sourceLinks.github}>source on GitHub</a>. Keep reports locally while platform storage and upload workflows are being developed.</p>
          <p>These docs describe the code in the current branch. Features developed elsewhere are not assumed to be available until they are integrated and verified.</p>
        </>
      },
    ],
  },
];


export const documentation: DocumentationPage[] = [...coreDocumentation, ...supportDocumentation, {
  slug: "command-builder",
  title: "The right command. Ready to copy.",
  eyebrow: "TOOLS / COMMAND BUILDER",
  description: "Choose a task, tune its verified options, and copy a command for your own PowerShell terminal. No execution, local-file access, or backend connection.",
  sections: [
    { id: "build-command", title: "Build your command", body: <CommandBuilder /> },
    { id: "builder-scope", title: "Supported scope & limitations", body: <><p>This browser-only tool targets the CLI v2.0.0 parser and PowerShell 7+. It generates canonical audit, init, fix, doctor, compare, api, test, and flow forms; aliases autofix/e2e remain available in the CLI. Compare requires two report paths here; flow requires an explicit file or directory.</p><p>The initial audit controls cover report/ci/strict profiles, CI policies, route selection, output directory, report formats, local history, and baseline comparison. The CLI also supports other options, including fast/full profiles, custom URLs, debug output, and Lighthouse budgets. These remain in the <Link href="/docs/commands">command reference</Link> rather than this first builder version. There is no config-file flag to invent: supported commands load the project's configuration themselves.</p><p>Literal path validation deliberately excludes shell variables, operators, wildcards, URLs, credentials, and leading hyphens. Prefix a project named after a CLI command (for example init) with ./ when auditing it. Paths are not checked for existence. Filesystem authorization, browser readiness, configuration, and actual report generation must be verified when you run the command.</p><p>All generated text is for review and use in your own terminal. No Git hook, commit, upload, or platform workflow is installed by this builder. See <Link href="/docs/troubleshooting">Troubleshooting</Link> if execution fails.</p></> },
  ],
}];
