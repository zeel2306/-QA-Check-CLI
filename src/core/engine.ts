import fs from "fs/promises";
import path from "path";
import { detectProjectFramework } from "../framework.js";
import { PipelineFactory } from "../pipeline/factory.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { logger } from "./logger.js";
import { calculateOverallScore, generateReports } from "./report.js";
import type { AuditReport, CheckResult } from "../types/result.js";
import { compareWithBaseline, readBaselineReport } from "../baseline/compare.js";
import { createCheckRegistry } from "../checks/registry.js";
import type { QAContext } from "./context.js";
import { executeCheck, toQACheck } from "./executor.js";
import type { QaProfile } from "./profile.js";
import { createHistoryTrend, readHistory, writeHistorySnapshot } from "../history.js";

export interface QaEngineOptions {
  profile?: QaProfile;
  ci?: boolean;
  html?: boolean;
  json?: boolean;
  markdown?: boolean;
  pdf?: boolean;
  output?: string;
  failOn?: "warning" | "error" | "none";
  minScore?: number;
  includeRoutes?: string[];
  ignoreRoutes?: string[];
  maxRoutes?: number;
  history?: boolean;
  historyLimit?: number;
  baseline?: string;
  baselineComparison?: boolean;
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
  const requestedRealPath = await fs.realpath(path.resolve(requestedPath));
  const detection = detectProjectFramework(requestedRealPath);
  const projectPath = detection.projectPath;
  const reportDir = path.join(
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
  const checks = pipeline.checks().map(toQACheck);
  const registry = createCheckRegistry(checks);
  const executionPlan = registry.getAll();

  for (let index = 0; index < executionPlan.length; index++) {
    const check = executionPlan[index];

    logger.start(index + 1, executionPlan.length, check.name);

    results.push(await executeCheck(check, context));
  }
} finally {
  await runtime.stop();
}

  const baseUrl = await runtime.baseUrl();
  const duration = performance.now() - started;
  const overallScore = calculateOverallScore(results);
  const report: AuditReport = {
    version: 2,
    projectPath,
    framework: detection.framework,
    language: detection.language,
    packageManager: detection.packageManager,
    buildTool: detection.buildTool,
    pipeline: pipeline.framework,
    checksExecuted: results
      .filter((result) => result.status !== "SKIPPED")
      .map((result) => result.name),
    checksSkipped: results
      .filter((result) => result.status === "SKIPPED")
      .map((result) => `${result.name}${result.message ? ` (${result.message})` : ""}`),
    baseUrl,
    routes,
    startedAt,
    finishedAt: new Date().toISOString(),
    duration,
    overallScore,
    results,
  };
  report.baseline = compareWithBaseline(report, baselineReport, baselinePath);
  const previousHistory = options.history === false ? [] : await readHistory(historyDir);
  if (options.history !== false) {
    report.history = createHistoryTrend(report, previousHistory, historyDir);
  }
  let outputs = {
  html: "",
  json: "",
  pdf: "",
  markdown: "",
};

if (options.html !== false || options.json !== false || options.pdf !== false) {
  outputs = await generateReports(report, reportDir, {
    html: options.html,
    json: options.json,
    markdown: options.markdown,
    pdf: options.pdf,
  });
}
  if (options.history !== false) {
    await writeHistorySnapshot(report, historyDir, options.historyLimit ?? 30);
  }
  logger.footer(overallScore, outputs.html, report.baseline);
  return report;
}
