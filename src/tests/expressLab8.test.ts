import test from "node:test";
import assert from "node:assert/strict";
import { crawlExpressRoutes } from "../crawler.js";
import { ExpressPipeline } from "../pipeline/express.pipeline.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { ApiTestingCheck, type ApiTestCase } from "../checks/api.js";
import { calculateScanCoverage, calculateOverallScore } from "../core/report.js";
import type { CheckResult } from "../types/result.js";

import fsSync from "fs";

const LAB_08_PATH =
  process.env.LAB_08_PATH ||
  (fsSync.existsSync("D:/qa-check-testing-projects/qa-check-lab-08-express-ts")
    ? "D:/qa-check-testing-projects/qa-check-lab-08-express-ts"
    : undefined);

test("crawlExpressRoutes discovers Express app and router endpoints with method identity", async (t) => {
  if (!LAB_08_PATH || !fsSync.existsSync(LAB_08_PATH)) {
    t.skip("Lab 08 fixture not available on system");
    return;
  }
  const routes = await crawlExpressRoutes(LAB_08_PATH);

  assert.ok(routes.length >= 10, `Expected at least 10 Express routes, got ${routes.length}`);
  assert.ok(routes.includes("GET /api/health"), "Should discover GET /api/health");
  assert.ok(routes.includes("GET /api/users"), "Should discover GET /api/users");
  assert.ok(routes.includes("GET /api/users/:id"), "Should discover GET /api/users/:id with parameter");
  assert.ok(routes.includes("POST /api/users"), "Should discover POST /api/users");
  assert.ok(routes.includes("DELETE /api/users/:id"), "Should discover DELETE /api/users/:id");
  assert.ok(routes.includes("HEAD /api/ping"), "Should discover HEAD /api/ping");
});

test("ExpressPipeline registers correct set of checks including API Testing", () => {
  const runtime = new PipelineRuntime("/mock/path", "/mock/report");
  const pipeline = new ExpressPipeline(runtime);
  const checks = pipeline.checks();

  const names = checks.map((c) => c.name);
  assert.ok(names.includes("Build"), "Should include Build check");
  assert.ok(names.includes("ESLint"), "Should include ESLint check");
  assert.ok(names.includes("TypeScript"), "Should include TypeScript check");
  assert.ok(names.includes("Code Quality Insights"), "Should include Code Quality Insights check");
  assert.ok(names.includes("Route Discovery"), "Should include Route Discovery check");
  assert.ok(names.includes("API Testing"), "Should include API Testing check");
  assert.ok(names.includes("Lighthouse Performance"), "Should include Lighthouse check");
});

test("NOT_APPLICABLE checks are excluded from scan coverage and score denominators", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "TypeScript", status: "PASS", score: 100, duration: 10 },
    { name: "Code Quality Insights", status: "WARNING", score: 90, duration: 10 },
    { name: "Route Discovery", status: "PASS", score: 100, duration: 10 },
    { name: "API Testing", status: "FAIL", score: 64, duration: 10 },
    { name: "SEO", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Accessibility", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Lighthouse Performance", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Responsive", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Performance", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Broken Links", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Broken Images", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Console Errors", status: "NOT_APPLICABLE", score: null, duration: 0 },
    { name: "Network Errors", status: "NOT_APPLICABLE", score: null, duration: 0 },
  ];

  const coverage = calculateScanCoverage(results);
  assert.equal(coverage.applicableScanners, 5, "Applicable scanners should be 5");
  assert.equal(coverage.executedSuccessfully, 5, "Executed scanners should be 5");
  assert.equal(coverage.notApplicable, 9, "Not applicable scanners should be 9");
  assert.equal(coverage.coveragePercent, 100, "Coverage percent should be 100%");

  const score = calculateOverallScore(results);
  assert.ok(score > 80 && score < 95, `Expected overall score around 92, got ${score}`);
});

test("ApiTestingCheck correctly evaluates test case pass and fail status", async () => {
  const cases: ApiTestCase[] = [
    {
      name: "mock success",
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      expect: { status: 200, requiredFields: ["id", "title"] },
    },
  ];

  const check = new ApiTestingCheck(cases);
  const result = await check.run("/mock");
  assert.equal(result.name, "API Testing");
  assert.equal(result.status, "PASS");
  assert.equal(result.data?.total, 1);
  assert.equal(result.data?.passed, 1);
});
