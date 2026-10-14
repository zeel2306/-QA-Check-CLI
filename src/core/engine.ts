import fs from "fs/promises";
import path from "path";
import { createHash } from "node:crypto";
import { detectProjectFramework } from "../framework.js";
import { PipelineFactory } from "../pipeline/factory.js";
import { LazyApiTestingCheck, PipelineRuntime } from "../pipeline/runtime.js";
import { logger } from "./logger.js";
import { assessScoreEvidence, calculateOverallScore, calculateScanCoverage, evaluateCurrentQualityGate, generateReports } from "./report.js";
import type { AuditReport, CheckResult } from "../types/result.js";
import { compareWithBaseline, readBaselineReport } from "../baseline/compare.js";
import { correlateCanonicalDefects, alignSourceRoutes } from "../core/canonical.js";
import { normalizeCheckResult } from "./normalize.js";
import { sanitizeAnsi } from "../utils/ansi.js";
import { lighthouseRouteTimeout } from "./lighthouseSettings.js";
import { createCheckRegistry } from "../checks/registry.js";
import type { QAContext } from "./context.js";
import { executeCheck, toQACheck } from "./executor.js";
import type { QaProfile } from "./profile.js";
import { createHistoryTrend, readHistory, writeHistorySnapshot } from "../history.js";
import { loadConfig } from "./config.js";

import { ApiTestingCheck, type ApiTestCase } from "../checks/api.js";
import { E2EFlowTestingCheck, type E2EUserFlow } from "../checks/e2e.js";
import type { AuthConfig } from "./auth.js";

export interface QaEngineOptions {
  profile?: QaProfile;
  ci?: boolean;
  debug?: boolean;
  html?: boolean;
  json?: boolean;
  markdown?: boolean;
  pdf?: boolean;
  output?: string;
  url?: string;
  baseUrl?: string;
  failOn?: "warning" | "error" | "none";
  minScore?: number;
  includeRoutes?: string[];
  ignoreRoutes?: string[];
  maxRoutes?: number;
  history?: boolean;
  historyLimit?: number;
  baseline?: string;
  baselineComparison?: boolean;
  apiTestCases?: ApiTestCase[];
  lighthouseBudgetMs?: number;
  lighthouseRouteTimeoutMs?: number;
  formLabelPolicy?: "associated" | "visible";
  auth?: AuthConfig;
  flows?: E2EUserFlow[];
  runtime?: Partial<import("./readiness.js").RuntimeSettings>;
  signal?: AbortSignal;
}

async function readPackageJson(projectPath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(projectPath, "package.json"), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Coordinates detection, pipeline selection, execution, cleanup, and reporting. */
export async function runQaEngine(
  requestedPath = process.cwd(),
  options: QaEngineOptions = {},
): Promise<AuditReport> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const cancellation = new AbortController();
  const interrupt = () => { cancellation.abort(new Error("Scan cancelled by Ctrl+C")); process.exitCode = 130; };
  options = { ...options, signal: options.signal ? AbortSignal.any([options.signal, cancellation.signal]) : cancellation.signal };
  const requestedRealPath = await fs.realpath(path.resolve(requestedPath));
  options = { ...loadConfig(requestedRealPath), ...options };
  lighthouseRouteTimeout(options.lighthouseRouteTimeoutMs);
  let detection = detectProjectFramework(requestedRealPath);
  if (detection.framework === "Unknown") {
    const children = await fs.readdir(requestedRealPath, { withFileTypes: true });
    const candidates = children.filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map(entry => detectProjectFramework(path.join(requestedRealPath, entry.name)))
      .filter(project => ["Next.js", "React", "Vue", "Angular", "Nuxt", "Svelte"].includes(project.framework));
    if (candidates.length === 1) detection = candidates[0]!;
  }
  const projectPath = detection.projectPath;
  const reportDir = path.resolve(
  projectPath,
  options.output ?? "reports",
);
  const historyDir = path.join(reportDir, "history");
  const baselinePath =
    options.baseline ??
    (options.baselineComparison === false
      ? undefined
      : path.join(reportDir, "report.json"));
  const baselineReport = baselinePath
    ? await readBaselineReport(path.resolve(projectPath, baselinePath))
    : undefined;
  const runtime = new PipelineRuntime(projectPath, reportDir, options);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const scanTimer = setTimeout(() => cancellation.abort(new Error("Overall scan execution deadline exceeded")), runtime.settings.scanTimeoutMs);
  const pipeline = PipelineFactory.create(detection, runtime);
  const results: CheckResult[] = [];

  logger.header();
  console.log(`Framework\n\n✔ ${detection.framework}\n`);
  console.log(`Pipeline\n\n✔ ${pipeline.framework}\n`);

  const routes = await runtime.routes().catch(() => []);
  const packageJson = await readPackageJson(projectPath);
  const context: QAContext = {
    projectPath,
    reportDir,
    detection,
    framework: detection.framework,
    language: detection.language,
    packageManager: detection.packageManager,
    buildTool: detection.buildTool,
    pipeline: pipeline.framework,
    config: options,
    routes,
    logger,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      ci: Boolean(options.ci),
    },
    runtime,
    packageJson,
  };

  try {
    const rawChecks = pipeline.checks();
    if (options.apiTestCases && options.apiTestCases.length > 0) {
      if (!rawChecks.some((c) => c.name === "API Testing")) {
        rawChecks.push(new LazyApiTestingCheck(runtime));
      }
    }
    if (options.flows && options.flows.length > 0) {
      rawChecks.push(new E2EFlowTestingCheck(options.flows, await runtime.baseUrl(), undefined, reportDir));
    }
    const checks = rawChecks.map(toQACheck);
  const registry = createCheckRegistry(checks);
  const executionPlan = registry.getAll();

  for (let index = 0; index < executionPlan.length; index++) {
    const check = executionPlan[index];

    logger.start(index + 1, executionPlan.length, check.name);

    const result = await executeCheck(check, context);
    const browserChecks = ["Responsive", "SEO", "Accessibility", "Performance", "Broken Links", "Broken Images", "Console Errors", "Network Errors", "Lighthouse Performance"];
    let scope: unknown;
    if (browserChecks.includes(check.name) && ["PASS", "FAIL", "WARNING", "PARTIAL"].includes(result.status)) scope = await runtime.browserRoutes().catch(() => []);
    if (check.name === "API Testing") scope = options.apiTestCases?.map((item) => ({ name: item.name, method: item.method || "GET", url: item.url, expect: item.expect, body: item.body, headerNames: Object.keys(item.headers || {}).sort() }));
    if (scope) result.metadata = { ...result.metadata, scopeKey: createHash("sha256").update(JSON.stringify(check.name === "Accessibility" ? { routes: scope, formLabelPolicy: options.formLabelPolicy || "off" } : scope)).digest("hex") };
    if (browserChecks.includes(check.name) && Array.isArray(scope)) {
      alignSourceRoutes(result, scope);
      result.issues = [];
      Object.assign(result, normalizeCheckResult(result));
    }
    results.push(result);
  }
} finally {
  await runtime.stop();
  clearTimeout(scanTimer);
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}

  const baseUrl = runtime.diagnostics.url;
  if (runtime.diagnostics.url) console.log(`Runtime diagnostics: ${runtime.diagnostics.ownership}; startup ${runtime.diagnostics.startupDurationMs}ms; readiness ${runtime.diagnostics.readinessDurationMs}ms; browser evidence ${runtime.diagnostics.browserAuditDurationMs ?? 0}ms`);
  const duration = performance.now() - started;
  const overallScore = calculateOverallScore(results);
  const coverage = calculateScanCoverage(results);
  const currentQualityGate = evaluateCurrentQualityGate(results, overallScore, options);
  const canonicalDefects = correlateCanonicalDefects(results);
  const rawObservations = results.reduce((sum, r) => {
    if (r.status === "PASS" || r.status === "SKIPPED" || r.status === "NOT_APPLICABLE") return sum;
    const data = r.data as any;
    if (r.name.startsWith("Lighthouse") || r.name === "Performance") return sum;
    if (data && Array.isArray(data.findings)) return sum + data.findings.length;
    if (data && typeof data.failed === "number") return sum + data.failed;
    if (data && Array.isArray(data.issues)) return sum + data.issues.length;
    if (data && typeof data.totalIssues === "number") return sum + data.totalIssues;
    if (Array.isArray(data)) return sum + data.length;
    return sum;
  }, 0);
  const uniqueDefects = canonicalDefects.length;

  const report: AuditReport = {
    version: 2,
    projectPath,
    framework: detection.framework,
    language: detection.language,
    packageManager: detection.packageManager,
    buildTool: detection.buildTool,
    pipeline: pipeline.framework,
    checksExecuted: results
      .filter((result) => result.status === "PASS" || result.status === "FAIL" || result.status === "WARNING" || result.status === "ERROR")
      .map((result) => result.name),
    checksSkipped: results
      .filter((result) => result.status === "SKIPPED")
      .map((result) => `${result.name}${result.message ? ` (${result.message})` : ""}`),
    checksNotApplicable: results
      .filter((result) => result.status === "NOT_APPLICABLE")
      .map((result) => `${result.name}${result.message ? ` (${result.message})` : ""}`),
    baseUrl,
    runtime: runtime.diagnostics,
    routes,
    startedAt,
    finishedAt: new Date().toISOString(),
    duration,
    overallScore,
    scoreEvidence: assessScoreEvidence(results, overallScore),
    coverage,
    currentQualityGate,
    rawObservations,
    uniqueDefects,
    canonicalDefects,
    results,
  };
  const sanitizedReport = sanitizeAnsi(report);
  sanitizedReport.baseline = compareWithBaseline(sanitizedReport, baselineReport, baselinePath);
  const previousHistory = options.history === false ? [] : await readHistory(historyDir);
  if (options.history !== false) {
    sanitizedReport.history = createHistoryTrend(sanitizedReport, previousHistory, historyDir);
  }
  let outputs = {
  html: "",
  json: "",
  pdf: "",
  markdown: "",
};

if (options.html !== false || options.json !== false || options.pdf !== false) {
  outputs = await generateReports(sanitizedReport, reportDir, {
    html: options.html,
    json: options.json,
    markdown: options.markdown,
    pdf: options.pdf,
  });
}
  if (options.history !== false) {
    await writeHistorySnapshot(sanitizedReport, historyDir, options.historyLimit ?? 30);
  }
  logger.footer(overallScore, outputs.html, sanitizedReport.baseline, sanitizedReport);
  return sanitizedReport;
}
