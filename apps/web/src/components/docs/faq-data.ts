import type { FaqCategory } from "./types";

export const faqCategories: FaqCategory[] = [
  {
    id: "general", title: "General", questions: [
      { id: "what-is-cli", question: "What is QA Check CLI?", answer: "An open-source, framework-aware command-line tool that audits local projects and generates quality reports. The selected pipeline depends on project detection and available tooling.", related: "/docs#meet-qa-check" },
      { id: "free", question: "Is QA Check CLI free?", answer: "The repository declares the MIT license, permitting use, modification, and distribution under its terms. The CLI does not require a platform subscription. This does not promise future SaaS pricing or remove costs for your own infrastructure and tooling.", related: "/docs#platform-and-source" },
      { id: "supported-projects", question: "Which projects are supported?", answer: "The pipeline factory includes Next.js, React, Vite, Vue, Nuxt, Angular, Astro, Laravel, WordPress, PHP websites, Flutter, Expo/React Native, Swift/SwiftUI, HTML and recognized CSS-framework sites, and Express. Unknown detections use a generic pipeline. Pipeline presence does not guarantee identical checks or execution without each project's native tools.", related: "/docs/installation#requirements" },
      { id: "internet", question: "Does QA Check CLI require an internet connection?", answer: "Package and browser installation generally need access to download sources. After installation, checks can run against local projects, but audits may request external links, configured API URLs, CDN assets, or project services. Offline success depends on selected checks and the application; there is no documented universal offline-mode flag.", related: "/docs/commands#audit" },
    ]
  },
  {
    id: "installation-usage", title: "Installation and usage", questions: [
      { id: "node-version", question: "What Node.js version is required?", answer: "CLI v2 requires Node.js >=22.19.0, verified by package.json and a guard that runs before commands. Node 20 and earlier Node 22 releases are unsupported. Check node --version in the same terminal that runs qa-check.", related: "/docs/troubleshooting#unsupported-node" },
      { id: "first-audit", question: "How do I run my first audit?", answer: "Install qa-check-cli, verify qa-check --version, install the target project's dependencies, then run qa-check . --profile report from that project. The dot matters: qa-check without arguments shows help. Browser checks require their browser/runtime prerequisites.", related: "/docs#quick-start" },
      { id: "format-selection", question: "How do I select a report format?", answer: "Normal audits enable JSON, HTML, Markdown, and PDF by default. Use --json, --html, --markdown (or --md), and --pdf to enable them; use their --no-* forms to disable them. These flags apply to normal audits, not standalone subcommands.", related: "/docs/reports#report-files" },
      { id: "before-push", question: "Can I run QA Check CLI before pushing code?", answer: "Yes. Run a local audit when your project is ready. For a command that signals quality-gate failure to automation, use qa-check . --profile ci or the stricter profile. The CLI does not automatically install a Git hook, commit, or push changes.", related: "/docs/commands#profiles" },
    ]
  },
  {
    id: "scanning-quality", title: "Scanning and quality", questions: [
      { id: "score", question: "What does the quality score mean?", answer: "It is a rounded average of eligible scanner scores, with exact-name weighting and fallback rules in the report implementation. It measures available evidence, not a guarantee that every route or feature was tested. Read scoreEvidence, coverage, and gate reasons alongside it.", related: "/docs/reports#quality-scores" },
      { id: "status-differences", question: "What is the difference between FAIL, WARNING, and SKIPPED?", answer: "FAIL means a scanner completed with a failing condition; WARNING carries findings needing review; SKIPPED means it was not performed. The message and skipReason explain context. Quality-gate policy and the selected profile affect exit behavior separately.", related: "/docs/reports#statuses" },
      { id: "skipped-pass", question: "Does a skipped scanner mean the project passed?", answer: "No. An unexecuted check provides no passing evidence. Resolve unexpected skips and inspect incomplete coverage. NOT_APPLICABLE is a separate status for checks that do not apply to the selected project or scope.", related: "/docs/troubleshooting#incomplete-coverage" },
      { id: "lighthouse-timeout", question: "Why might Lighthouse fail or time out?", answer: "Chrome launch, application readiness, route rendering, Lighthouse runtime errors, and budgets are distinct possible causes. Use the actual error and route diagnostics to locate the stage before changing a budget. A larger timeout does not repair a broken route or missing browser.", related: "/docs/troubleshooting#lighthouse-fails" },
      { id: "comparison", question: "How do I compare audit results?", answer: "Keep two JSON reports, then run qa-check compare reports/baseline.json reports/report.json. The standalone command needs both files for a comparison; a single readable file prints its score without finding another baseline automatically. Keep scanner version and scope comparable.", related: "/docs/commands#compare" },
    ]
  },
  {
    id: "reports", title: "Reports", questions: [
      { id: "report-location", question: "Where are reports generated?", answer: "Normal audits default to reports/ under the detected project. --output changes that directory. Local history, when enabled, is under the output's history directory. Standalone help/doctor/api/flow commands are not the normal report-producing audit.", related: "/docs/reports#report-files" },
      { id: "report-formats", question: "Which report formats are supported?", answer: "The writers produce report.json, index.html, report.md, and report.pdf. A PDF writer failure is logged and can leave the PDF absent. Enabled formats require a successful write and a run that reaches report generation.", related: "/docs/troubleshooting#missing-reports" },
      { id: "sharing", question: "Can I share reports with QA engineers?", answer: "Share local artifacts through your own approved channels. Keep HTML assets and screenshots together and inspect reports for project paths, URLs, screenshots, errors, and application information before sharing. The configured SaaS can store imported evidence, but full team collaboration workflows are not implemented.", related: "/docs/reports#review-findings" },
      { id: "upload", question: "Can I upload JSON reports to QA Check Platform?", answer: "Yes, through POST /api/v1/runs with a project-scoped token and configured PostgreSQL, private object storage, and import worker. The CLI has no login or --upload command. qa-check api tests configured endpoints and is not an upload command.", related: "/docs/platform#availability" },
    ]
  },
  {
    id: "platform", title: "Platform", questions: [
      { id: "what-is-platform", question: "What is QA Check Platform?", answer: "The root Next.js SaaS organizes projects and imported CLI audit evidence using Clerk authentication and Prisma/PostgreSQL persistence. Audits run locally in the separate CLI.", related: "/docs/platform#purpose" },
      { id: "public-availability", question: "Is the platform publicly available?", answer: "This branch provides public-facing pages, but that is not proof of a deployed or publicly launched SaaS. No live hosted dashboard, public account workflow, or launch is claimed by this documentation.", related: "/docs/platform#purpose" },
      { id: "implemented", question: "What platform features are currently implemented?", answer: "The root SaaS implements authenticated projects, project tokens, queued JSON report imports, saved run history, scores, and findings. These require configured authentication, PostgreSQL, private object storage, and the import worker. Their presence in code is not proof of a verified live deployment.", related: "/docs/platform#availability" },
      { id: "planned", question: "What features are planned?", answer: "Full team management and collaborative QA workflows remain incomplete. Hosted scan execution is not implemented. Projects and JSON evidence imports already have implementations, subject to configured services; production readiness is not claimed.", related: "/docs/platform#planned-workflow" },
    ]
  },
];
