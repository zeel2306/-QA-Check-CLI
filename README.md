# 🚀 QA Check CLI

<p align="center">

A powerful **framework-aware Quality Assurance CLI** that automatically audits modern web projects for **code quality, SEO, accessibility, performance, responsiveness, broken links, images, console errors, network issues, and more.**

Detect the framework → Select the correct QA pipeline → Generate a beautiful report.

</p>

---

## 📌 Project Status

QA Check CLI is actively being developed as a framework-aware testing and QA
reporting tool for modern web projects.

The current stable npm release is `1.0.7`. Version `1.1.0` has been published
and may appear as `Validating` on npm until npm finishes its automated review.
Once review completes, `1.1.0` will become available as the latest release.

Version `1.1.0` focuses on turning QA Check CLI into a complete reporting
workflow:

- Professional dark HTML dashboard
- JSON and PDF report generation
- Screenshot gallery
- Fix suggestions for common issues
- Baseline comparison
- GitHub Actions support
- CI profiles for report-only, normal CI, and strict CI modes

If you only want reports and do not want QA checks to block CI, use:

```bash
qa-check . --profile report
```

---

## ✨ Features

- 🔍 Automatic framework detection
- ⚡ Framework-specific QA pipelines
- 🏗 Build validation
- 📝 ESLint validation
- 📘 TypeScript validation
- 📱 Responsive design testing
- ♿ Accessibility audit (axe-core)
- 🌐 SEO audit
- 🚀 Lighthouse audit
- 🔗 Broken link detection
- 🖼 Broken image detection
- 🐞 Console error detection
- 🌍 Network request validation
- 📄 Beautiful HTML dashboard report
- 📊 JSON report
- 🧾 PDF report
- 💡 Practical fix suggestions
- 📈 Baseline comparison
- 🔎 Search and filtering in the report
- 📊 Dashboard charts and analytics
- 🧪 CI profiles: report, ci, strict
- ☁ GitHub Actions workflow
- 🎯 Overall Quality Score
- 📸 Responsive screenshots

---

# 📸 Screenshots

## Dashboard


![Dashboard](https://raw.githubusercontent.com/zeel2306/-QA-Check-CLI/refs/heads/main/screenshots/dashboard.png)

---

## Audit Results

![Audit Results](https://raw.githubusercontent.com/zeel2306/-QA-Check-CLI/refs/heads/main/screenshots/cards.png)

---

## Screenshot Gallery

![Gallery](https://raw.githubusercontent.com/zeel2306/-QA-Check-CLI/refs/heads/main/screenshots/details.png)

---

# 📦 Installation

Install globally

```bash
npm install -g qa-check-cli
```

Verify installation

```bash
qa-check --version
```

If `qa-check` is not recognized on Windows, the CLI is not available on your
PATH yet. Install it globally first, or run it through `npx`:

```bash
npm install -g qa-check-cli
qa-check --version
```

```bash
npx qa-check-cli .
```

When developing this repository locally, build and link it before using the
global command:

```bash
npm run build
npm link
qa-check --version
```

To debug PATH issues on Windows:

```powershell
where qa-check
npm config get prefix
```

---

# 🚀 Usage

Audit current project

```bash
qa-check .
```

Audit another project

```bash
qa-check "D:\Projects\Phoenix"
```

Laravel Example

```bash
qa-check "C:\xampp\htdocs\LaravelProject"
```

Compare with a previous report

```bash
qa-check . --baseline "reports\report.json"
```

By default, QA Check compares the current run with the previous
`reports/report.json` when it exists. Disable this with:

```bash
qa-check . --no-baseline
```

Use a QA profile

```bash
qa-check . --profile report
qa-check . --profile ci
qa-check . --profile strict
```

Profiles:

```text
report = generate reports and never fail because of QA results
ci     = fail on FAIL or ERROR checks
strict = fail on WARNING/FAIL/ERROR checks and require 80/100
```

Use `report` when QA Check is used as a testing and documentation tool.
Use `ci` when failed checks should block CI.
Use `strict` when warnings and low score should also block CI.

---

# 📄 Generated Report

After the audit finishes

```
reports/

├── index.html
├── report.json
├── report.pdf
└── screenshots/
```

Open

```
reports/index.html
```

to view the complete interactive dashboard.

---

# GitHub Actions

QA Check CLI includes a ready-to-use GitHub Actions workflow at:

```text
.github/workflows/qa-check.yml
```

The workflow runs on push, pull request, and manual workflow dispatch.

It uses Node.js 20, installs project dependencies, runs QA Check in CI mode,
generates HTML, JSON, PDF, and screenshot reports, then uploads them as
downloadable workflow artifacts.

Default command:

```bash
npx qa-check-cli . --ci --pdf --profile ci --output reports
```

Uploaded artifacts:

```text
reports/index.html
reports/report.json
reports/report.pdf
reports/screenshots/
```

## CI Failure Rules

Recommended profiles:

```bash
--profile report
```

Use this when QA Check is only for testing and report generation.

```bash
--profile ci
```

Use this for normal CI. It fails on `FAIL` or `ERROR` checks.

```bash
--profile strict
```

Use this for stricter teams. It fails on `WARNING`, `FAIL`, `ERROR`, or score below `80/100`.

Fail only when a check has `FAIL` status:

```bash
--fail-on error
```

Fail when a check has `WARNING` or `FAIL` status:

```bash
--fail-on warning
```

Generate reports but never fail CI because of QA check status:

```bash
--fail-on none
```

Fail only when the overall score is below a minimum threshold:

```bash
--min-score 80
```

## Configuration

The workflow supports manual configuration through workflow dispatch:

- Node version
- QA profile: `report`, `ci`, or `strict`
- Fail threshold: `error`, `warning`, or `none`
- Minimum score
- Report output folder

Default values:

```yaml
node_version: 20
profile: ci
fail_on: profile
min_score: profile
report_dir: reports
```

For push and pull request runs, edit the workflow `env` defaults in
`.github/workflows/qa-check.yml`:

```yaml
env:
  NODE_VERSION: 20
  QA_PROFILE: ci
  FAIL_ON: profile
  MIN_SCORE: profile
  REPORT_DIR: reports
```

Use `QA_PROFILE: report` when QA Check should only generate reports.
Use `QA_PROFILE: ci` for normal CI failure behavior.
Use `QA_PROFILE: strict` for stricter PR gates.
Use `FAIL_ON: warning` when warnings should block a pull request.
Use `FAIL_ON: error` when only failed checks should block a pull request.
Use `FAIL_ON: none` when QA Check should only generate reports.
Use `MIN_SCORE: 80` when the workflow should fail below `80/100`.

## Project Config File

You can also configure QA Check from `qa-check.config.json`:

```json
{
  "profile": "report",
  "failOn": "none",
  "minScore": 0,
  "output": "reports",
  "pdf": true,
  "baselineComparison": true
}
```

CLI flags override values from the config file.

## Example 1: Run on Every Push

```yaml
on:
  push:
```

## Example 2: Run Only on Pull Requests

```yaml
on:
  pull_request:
```

## Example 3: Manual Execution

```yaml
on:
  workflow_dispatch:
```

The workflow writes a GitHub job summary with framework, pipeline, overall
score, and PASS/WARNING/FAIL/SKIPPED counts. If QA fails, reports are still
uploaded before the workflow exits with the QA Check CLI exit code.

---

# 📊 Sample Output

```
QA CHECK

Framework : Next.js

Pipeline : Next.js

Pages : 40

✔ Build
✔ ESLint
✔ TypeScript
✔ Responsive
✔ Accessibility
✔ SEO
✔ Lighthouse

Overall Score

92/100
```

---

# 🌍 Supported Frameworks

### Frontend

- Next.js
- React
- Vue
- Angular
- Nuxt
- Astro
- Svelte
- SvelteKit
- Qwik
- Gatsby
- Remix
- SolidJS
- Vite

### Backend

- Laravel
- PHP
- Express
- NestJS
- Fastify
- Koa
- Hono
- Flask
- Django
- FastAPI
- Spring Boot
- ASP.NET

### CMS

- WordPress
- Drupal
- Joomla
- Magento
- Shopify
- Ghost

### Mobile

- React Native
- Flutter
- Swift
- SwiftUI
- Android
- Kotlin
- Expo

### Desktop

- Electron
- Tauri

---

# 🔍 QA Checks

## Code Quality

- Build Validation
- ESLint
- TypeScript

## UI & UX

- Responsive Design
- Accessibility
- Performance

## SEO

- Page Title
- Meta Description
- Canonical URL
- Open Graph
- Twitter Card
- Structured Data
- Duplicate Metadata

## Network

- Broken Links
- Broken Images
- Console Errors
- Failed Requests

## Lighthouse

- Performance
- Accessibility
- SEO
- Best Practices

---

# 📋 Requirements

- Node.js 20+
- Google Chrome (for Lighthouse)
- npm

Some framework-specific pipelines require their native tools.

Examples

- PHP / Composer (Laravel)
- Flutter SDK
- Android SDK
- .NET SDK
- Java (Spring Boot)

---

# 🔄 Updating

```bash
npm update -g qa-check-cli
```

---

# 🛣 Roadmap

### Current

- ✅ Framework Detection
- ✅ Framework Pipelines
- ✅ HTML Dashboard
- ✅ JSON Report
- ✅ PDF Report
- ✅ Screenshot Gallery
- ✅ Lighthouse
- ✅ Accessibility
- ✅ SEO
- ✅ Performance
- ✅ Responsive Testing
- ✅ Fix Suggestions
- ✅ Baseline Comparison
- ✅ Charts & Analytics
- ✅ Interactive Search
- ✅ Issue Filtering
- ✅ Dark Theme
- ✅ GitHub Actions
- ✅ CI/CD Profiles

### Upcoming

- 📈 Historical Reports
- 📑 Excel Export
- 💬 GitHub Pull Request comments
- 🧭 Route include / exclude controls
- 🧪 More framework-specific checks
- 🧠 More intelligent fix suggestions
- 📦 Release automation

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

---

# 🐞 Report Issues

Found a bug?

Please create a GitHub Issue with:

- Framework
- OS
- Node Version
- Error Log
- Generated Report

---

# 📄 License

MIT License

---

# 👨‍💻 Author

**Zeel Patel**

QA Check CLI is an open-source project focused on making Quality Assurance faster, smarter, and framework-aware.
