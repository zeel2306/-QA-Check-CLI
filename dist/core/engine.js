import fs from "fs/promises";
import path from "path";
import { detectProjectFramework } from "../framework.js";
import { PipelineFactory } from "../pipeline/factory.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { logger } from "./logger.js";
import { calculateOverallScore, generateReports } from "./report.js";
async function execute(check, projectPath) {
    try {
        const result = await check.run(projectPath);
        logger.result(result);
        return result;
    }
    catch (error) {
        const result = {
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
export async function runQaEngine(requestedPath = process.cwd()) {
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const requestedRealPath = await fs.realpath(path.resolve(requestedPath));
    const detection = detectProjectFramework(requestedRealPath);
    const projectPath = detection.projectPath;
    const reportDir = path.join(projectPath, "reports");
    const runtime = new PipelineRuntime(projectPath, reportDir);
    const pipeline = PipelineFactory.create(detection, runtime);
    const results = [];
    logger.header();
    console.log(`Framework\n\n✔ ${detection.framework}\n`);
    console.log(`Pipeline\n\n✔ ${pipeline.framework}\n`);
    try {
        for (const check of pipeline.checks()) {
            results.push(await execute(check, projectPath));
        }
    }
    finally {
        await runtime.stop();
    }
    const routes = await runtime.routes().catch(() => []);
    const baseUrl = await runtime.baseUrl();
    const duration = performance.now() - started;
    const overallScore = calculateOverallScore(results);
    const report = {
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
    const outputs = await generateReports(report, reportDir);
    logger.footer(overallScore, outputs.html);
    return report;
}
