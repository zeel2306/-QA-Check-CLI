import fs from "fs/promises";
import path from "path";
import { detectProjectFramework } from "../framework.js";
import { PipelineFactory } from "../pipeline/factory.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { logger } from "./logger.js";
import { calculateOverallScore, generateReports } from "./report.js";
import type { AuditReport, Check, CheckResult } from "../types/result.js";
import { compareWithBaseline, readBaselineReport } from "../baseline/compare.js";

export interface QaEngineOptions {
  ci?: boolean;
  html?: boolean;
  json?: boolean;
  pdf?: boolean;
  output?: string;
  failOn?: "warning" | "error";
  baseline?: string;
  baselineComparison?: boolean;
}

async function execute(check: Check, projectPath: string): Promise<CheckResult> {
  try {
    const result = await check.run(projectPath);
    logger.result(result);
    return result;
  } catch (error) {
    const result: CheckResult = {
      name: check.name,
      status: "FAIL",
      message: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
    logger.result(result);
    return result;
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
  const baselinePath =
    options.baseline ??
    (options.baselineComparison === false
      ? undefined
      : path.join(reportDir, "report.json"));
  const baselineReport = baselinePath
    ? await readBaselineReport(path.resolve(projectPath, baselinePath))
    : undefined;
  const runtime = new PipelineRuntime(projectPath, reportDir);
  const pipeline = PipelineFactory.create(detection, runtime);
  const results: CheckResult[] = [];

  logger.header();
  console.log(`Framework\n\n✔ ${detection.framework}\n`);
  console.log(`Pipeline\n\n✔ ${pipeline.framework}\n`);

 try {
  const checks = pipeline.checks();

  for (let index = 0; index < checks.length; index++) {
    const check = checks[index];

    logger.start(index + 1, checks.length, check.name);

    results.push(await execute(check, projectPath));
  }
} finally {
  await runtime.stop();
}

  const routes = await runtime.routes().catch(() => []);
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
  let outputs = {
  html: "",
  json: "",
  pdf: "",
};

if (options.html !== false || options.json !== false || options.pdf !== false) {
  outputs = await generateReports(report, reportDir, {
    html: options.html,
    json: options.json,
    pdf: options.pdf,
  });
}
  logger.footer(overallScore, outputs.html, report.baseline);
  return report;
}
