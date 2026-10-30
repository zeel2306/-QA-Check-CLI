import Link from "next/link";
import { CodeBlock } from "./code-block";
import type { DocumentationPage } from "./types";

export const workspaceSections: DocumentationPage["sections"] = [
  { id: "workspace", title: "Explore or create a workspace", body: <><p>The <Link href="/demo">interactive demo</Link> uses sample data. Real accounts require configured Clerk authentication and PostgreSQL. Once configured, <Link href="/register">register</Link>, create a project, then generate a project token. Secrets are shown once. Existing users can <Link href="/login">sign in</Link>.</p></> },
  { id: "upload", title: "Upload a structured report", body: <>
    <p>The current CLI does not implement login or --upload. Use the versioned endpoint below with a project-scoped token. The server validates and projects report version 2 into sanitized fields; raw logs, source snippets, stacks, and headers are excluded. S3 and PostgreSQL must be configured, and the import worker must be running to process queued reports.</p>
    <CodeBlock label="Report upload" code={`# PowerShell — keep the token in an environment variable
$report = Get-Content reports/report.json -Raw | ConvertFrom-Json
$payload = @{ projectId = $env:QA_CHECK_PROJECT_ID;
  clientRunId = [guid]::NewGuid().ToString(); report = $report }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/runs \u0060
  -Headers @{ Authorization = "Bearer $env:QA_CHECK_TOKEN" } \u0060
  -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 30)`} />
    <p>Replace the example origin with your configured SaaS origin. Reuse the same clientRunId on retries. The JSON body is limited to 2 MiB. The uploaded report.json is a sanitized cloud projection, not a verbatim local file. Screenshots are not uploaded by this endpoint. An accepted upload is queued for processing; HTTP 202 does not mean import completion.</p>
  </> },
  { id: "ci", title: "Bring quality into CI", body: <>
    <p>Store QA_CHECK_TOKEN and QA_CHECK_PROJECT_ID in your CI secret manager. Run the local CLI with --ci --profile ci, retain local artifacts even on failure, and upload the report through the API only in trusted workflows. Never expose secrets to fork pull requests.</p>
    <CodeBlock label="CI audit" code="npx qa-check-cli . --ci --profile ci --output reports" />
  </> },
  { id: "capture-privacy", title: "Capture, privacy and limitations", body: <p>Hosted project data is private. Keep secrets out of URLs and issue messages before upload. Automatic pattern redaction is supplementary and cannot guarantee arbitrary text is free of secrets. API/E2E/visual pages currently demonstrate sample results, not live testing. Provider configuration and staged end-to-end verification are required before production use.</p> },
];

export const platformPage: DocumentationPage = {
  slug: "platform", title: "The platform, honestly.", eyebrow: "PLATFORM / CURRENT STATUS",
  description: "Implemented workspace and report-import capabilities, their prerequisites, and current limitations.",
  sections: [
    { id: "purpose", title: "A shared home for quality", body: <><p>The primary SaaS is the root apps/web Next.js application. Clerk provides authentication. Prisma models persist organizations, memberships, projects, tokens, test runs, issues, and import jobs in PostgreSQL. The local CLI performs audits; the web application imports their evidence.</p><p>Code presence does not establish a deployed service, verified provider setup, or production readiness.</p></> },
    { id: "availability", title: "Feature availability", body: <ul>
      <li>Authenticated project creation and project APIs for editing and archiving; project-scoped token generation with secrets shown once.</li>
      <li>POST /api/v1/runs validates version-2 JSON reports and queues imports. PostgreSQL, private S3-compatible storage, and a separately running worker are required.</li>
      <li>Completed imported runs provide history, scores, and findings. Stored JSON downloads use short-lived signed URLs. This is not hosted scan execution or hosted HTML/PDF/JUnit reporting.</li>
      <li>Workspace membership is enforced. Invitations, full team management, and organization selection are not completed product workflows.</li>
      <li>API/E2E/visual demonstration pages use sample results. Billing integration code is not proof of verified payments or production certification.</li>
    </ul> },
    { id: "planned-workflow", title: "The evidence workflow", body: <ol><li>Run the CLI locally and inspect its JSON, HTML, Markdown, or PDF reports.</li><li>Configure the SaaS services, register, create a project, and generate its token.</li><li>Send report.json through the <Link href="/docs#upload">report upload API</Link>; retain clientRunId for safe retries.</li><li>Run the import worker and review completed runs and findings in the authenticated workspace.</li><li>Enforce CI gates locally using the <Link href="/docs#ci">CI instructions</Link>. Stored quality-gate settings do not execute scans or enforce cloud gates.</li></ol> },
    { id: "use-today", title: "What you can use today", body: <><p>Follow the <Link href="/docs/installation">installation guide</Link> and <Link href="/docs/reports">reports guide</Link>. Explore <Link href="/demo">sample data</Link> without configuring services.</p><p>The CLI has no platform login or --upload command. qa-check api tests configured endpoints; it is not an upload command. Keep local artifacts and review sensitive content before importing or sharing evidence.</p></> },
  ],
};
