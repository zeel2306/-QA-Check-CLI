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
  api: [
    {
      name: "Sample Health Check API",
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      expect: {
        status: 200,
        responseTime: 2000
      }
    }
  ]
};

const workflow = `name: QA Check Quality Gate

on:
  push:
    branches: [ main, master, develop ]
  pull_request:
    branches: [ main, master, develop ]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

env:
  NODE_VERSION: 20
  QA_PROFILE: ci
  REPORT_DIR: reports
  QA_CHECK_PACKAGE: qa-check-cli@latest

jobs:
  qa-check:
    name: QA Quality Gate
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
          fi

      - name: Install browser dependencies
        shell: bash
        run: npx -y playwright install --with-deps chromium

      - name: Restore main branch baseline scan
        uses: actions/cache/restore@v4
        with:
          path: reports/baseline.json
          key: qa-check-baseline-\${{ github.event.repository.default_branch }}

      - name: Run QA Check CLI Quality Gate
        id: qa
        shell: bash
        run: |
          set +e
          CMD="npx -y \${QA_CHECK_PACKAGE} . --ci --profile \${QA_PROFILE} --output \${REPORT_DIR}"
          if [ -f "reports/baseline.json" ]; then
            CMD="$CMD --baseline reports/baseline.json"
          fi
          $CMD 2>&1 | tee qa-output.log
          EXIT_CODE=\${PIPESTATUS[0]}
          echo "exit_code=\${EXIT_CODE}" >> "$GITHUB_OUTPUT"
          exit 0

      - name: Save baseline scan (on main branch push)
        if: github.event_name == 'push' && (github.ref_name == github.event.repository.default_branch || github.ref_name == 'main' || github.ref_name == 'master')
        uses: actions/cache/save@v4
        with:
          path: reports/report.json
          key: qa-check-baseline-\${{ github.event.repository.default_branch }}-\${{ github.sha }}

      - name: Comment PR Quality Gate Summary
        if: always() && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require("fs");
            const path = require("path");
            const marker = "<!-- qa-check-pr-quality-gate -->";
            const reportPath = path.join(process.env.REPORT_DIR || "reports", "report.json");
            if (!fs.existsSync(reportPath)) return;
            const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
            
            const b = report.baseline;
            const qg = b ? b.qualityGate : null;
            const gatePassed = qg ? qg.passed : (report.overallScore >= 80);
            const gateBanner = gatePassed ? "### Quality Gate: PASSED ✅" : "### Quality Gate: FAILED ❌";
            
            let catRows = "";
            if (b && b.categoryScores) {
              catRows = b.categoryScores.map(c => {
                const icon = c.status === "REGRESSED" ? "🔴" : "🟢";
                return \`| **\${c.category}** | \${c.previousScore} → \${c.currentScore} | \${icon} |\`;
              }).join("\\n");
            }

            let newIssuesMD = "";
            if (b && b.categorizedIssues && b.categorizedIssues.newIssues && b.categorizedIssues.newIssues.length > 0) {
              newIssuesMD = "\\n\\n#### ❌ New Issues Detected\\n" + b.categorizedIssues.newIssues.map(i => \`- **[\${i.checkName}]** \${i.message}\`).join("\\n");
            }

            let fixedIssuesMD = "";
            if (b && b.categorizedIssues && b.categorizedIssues.fixedIssues && b.categorizedIssues.fixedIssues.length > 0) {
              fixedIssuesMD = "\\n\\n#### ✅ Fixed Issues\\n" + b.categorizedIssues.fixedIssues.map(i => \`- **[\${i.checkName}]** \${i.message}\`).join("\\n");
            }

            const body = [
              marker,
              "## 🛡️ QA Check Quality Gate Report",
              "",
              gateBanner,
              "",
              \`**Overall Score:** \\\`\${report.overallScore}/100\\\` \`,
              \`**Framework:** \\\`\${report.framework}\\\` \`,
              \`**Commit:** \\\`\${context.sha.substring(0, 7)}\\\` \`,
              "",
              catRows ? "#### Category Trends\\n| Category | Score | Status |\\n| --- | --- | :---: |\\n" + catRows : "",
              newIssuesMD,
              fixedIssuesMD,
              "",
              "---",
              "📥 *Download the attached \\\`qa-check-reports\\\` artifact to view full HTML, JSON, PDF, and screenshots.*"
            ].filter(Boolean).join("\\n");

            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const comments = await github.rest.issues.listComments({ owner, repo, issue_number, per_page: 100 });
            const previous = comments.data.find((comment) => comment.body?.includes(marker));
            if (previous) {
              await github.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
            } else {
              await github.rest.issues.createComment({ owner, repo, issue_number, body });
            }

      - name: Upload QA Reports & Artifacts
        if: always()
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

      - name: Fail Workflow if Quality Gate Failed
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
