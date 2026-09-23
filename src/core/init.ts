import fs from "fs/promises";
import path from "path";

export interface InitResult {
  created: string[];
  skipped: string[];
}

const defaultConfig = {
  profile: "report",
  output: "reports",
  markdown: true,
  pdf: true,
  baselineComparison: true,
  history: true,
  historyLimit: 30,
  includeRoutes: [],
  ignoreRoutes: ["/api", "/admin"],
  maxRoutes: 50,
};

const workflow = `name: QA Check

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

env:
  NODE_VERSION: 20
  QA_PROFILE: report
  REPORT_DIR: reports
  QA_CHECK_PACKAGE: qa-check-cli@latest

jobs:
  qa-check:
    name: Run QA Check
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}

      - name: Install project dependencies
        shell: bash
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          elif [ -f package.json ]; then
            npm install
          else
            echo "No package.json found. Skipping dependency installation."
          fi

      - name: Install browser dependencies
        shell: bash
        run: npx -y playwright install --with-deps chromium

      - name: Run QA Check CLI
        id: qa
        shell: bash
        run: |
          set +e
          npx -y "\${QA_CHECK_PACKAGE}" . --ci --pdf --profile "\${QA_PROFILE}" --output "\${REPORT_DIR}" 2>&1 | tee qa-output.log
          EXIT_CODE=\${PIPESTATUS[0]}
          echo "exit_code=\${EXIT_CODE}" >> "$GITHUB_OUTPUT"
          exit 0

      - name: Detect generated reports
        id: reports
        if: always()
        shell: bash
        run: |
          if [ -d "\${REPORT_DIR}" ] && [ "$(find "\${REPORT_DIR}" -type f | wc -l)" -gt 0 ]; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
          else
            echo "exists=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Write workflow summary
        if: always() && steps.reports.outputs.exists == 'true'
        shell: bash
        run: |
          node - <<'NODE'
          const fs = require("fs");
          const path = require("path");
          const reportPath = path.join(process.env.REPORT_DIR || "reports", "report.json");
          const summaryPath = process.env.GITHUB_STEP_SUMMARY;
          if (!summaryPath || !fs.existsSync(reportPath)) process.exit(0);
          const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
          const counts = { PASS: 0, WARNING: 0, FAIL: 0, ERROR: 0, SKIPPED: 0 };
          for (const result of report.results || []) counts[result.status] = (counts[result.status] || 0) + 1;
          fs.appendFileSync(summaryPath, [
            "# QA Check Report",
            "",
            "| Field | Value |",
            "| --- | --- |",
            \`| Overall Score | \${report.overallScore ?? 0}/100 |\`,
            \`| Framework | \${report.framework || "Unknown"} |\`,
            \`| PASS | \${counts.PASS} |\`,
            \`| WARNING | \${counts.WARNING} |\`,
            \`| FAIL | \${counts.FAIL + counts.ERROR} |\`,
            \`| SKIPPED | \${counts.SKIPPED} |\`,
            "",
          ].join("\\n"));
          NODE

      - name: Comment on pull request
        if: always() && github.event_name == 'pull_request' && steps.reports.outputs.exists == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require("fs");
            const path = require("path");
            const marker = "<!-- qa-check-cli-report -->";
            const reportPath = path.join(process.env.REPORT_DIR || "reports", "report.json");
            if (!fs.existsSync(reportPath)) return;
            const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
            const counts = { PASS: 0, WARNING: 0, FAIL: 0, ERROR: 0, SKIPPED: 0 };
            for (const result of report.results || []) counts[result.status] = (counts[result.status] || 0) + 1;
            const body = [
              marker,
              "## QA Check Report",
              "",
              \`**Score:** \${report.overallScore ?? 0}/100\`,
              \`**Framework:** \${report.framework || "Unknown"}\`,
              "",
              "| Status | Count |",
              "| --- | ---: |",
              \`| PASS | \${counts.PASS} |\`,
              \`| WARNING | \${counts.WARNING} |\`,
              \`| FAIL | \${counts.FAIL + counts.ERROR} |\`,
              \`| SKIPPED | \${counts.SKIPPED} |\`,
              "",
              "Download the uploaded \`qa-check-reports\` artifact to view HTML, JSON, PDF, and screenshots.",
            ].join("\\n");
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const comments = await github.rest.issues.listComments({ owner, repo, issue_number, per_page: 100 });
            const previous = comments.data.find((comment) => comment.body?.includes(marker));
            if (previous) {
              await github.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
            } else {
              await github.rest.issues.createComment({ owner, repo, issue_number, body });
            }

      - name: Upload QA Reports
        if: always() && steps.reports.outputs.exists == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: qa-check-reports
          path: |
            \${{ env.REPORT_DIR }}/index.html
            \${{ env.REPORT_DIR }}/report.json
            \${{ env.REPORT_DIR }}/report.md
            \${{ env.REPORT_DIR }}/report.pdf
            \${{ env.REPORT_DIR }}/screenshots/**
          if-no-files-found: warn
          retention-days: 14

      - name: Fail workflow when QA threshold is not met
        if: always() && steps.qa.outputs.exit_code != '0'
        shell: bash
        run: exit "\${{ steps.qa.outputs.exit_code }}"
`;

async function writeIfMissing(filePath: string, content: string): Promise<"created" | "skipped"> {
  try {
    await fs.access(filePath);
    return "skipped";
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return "created";
  }
}

export async function initializeProject(projectPath: string): Promise<InitResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  const files = [
    {
      path: path.join(projectPath, "qa-check.config.json"),
      content: `${JSON.stringify(defaultConfig, null, 2)}\n`,
    },
    {
      path: path.join(projectPath, ".github", "workflows", "qa-check.yml"),
      content: workflow,
    },
  ];

  for (const file of files) {
    const result = await writeIfMissing(file.path, file.content);
    const relative = path.relative(projectPath, file.path) || file.path;

    if (result === "created") {
      created.push(relative);
    } else {
      skipped.push(relative);
    }
  }

  return { created, skipped };
}
