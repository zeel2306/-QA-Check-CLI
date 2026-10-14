import test from "node:test";
import assert from "node:assert/strict";
import net from "net";
import http from "http";
import { isPortOccupied, checkServerHealth, findAvailablePort, startLocalServer } from "../core/runner.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { calculateScanCoverage, calculateOverallScore, evaluateCurrentQualityGate } from "../core/report.js";
import { compareWithBaseline } from "../baseline/compare.js";
import { executeCheck } from "../core/executor.js";
import { runLint } from "../lint.js";
import type { AuditReport, CheckResult } from "../types/result.js";
import type { QAContext } from "../core/context.js";

function createMockReport(results: CheckResult[], score = 80): AuditReport {
  const coverage = calculateScanCoverage(results);
  return {
    version: 2,
    projectPath: "/test-project",
    framework: "Next.js",
    pipeline: "Next.js",
    checksExecuted: results.filter((r) => r.status === "PASS" || r.status === "FAIL" || r.status === "WARNING" || r.status === "PARTIAL").map((r) => r.name),
    checksSkipped: results.filter((r) => r.status === "SKIPPED").map((r) => r.name),
    checksNotApplicable: results.filter((r) => r.status === "NOT_APPLICABLE").map((r) => r.name),
    routes: ["/", "/contact", "/dashboard"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 500,
    overallScore: score,
    coverage,
    results,
  };
}

test("1. Port management: isPortOccupied and checkServerHealth detect open vs closed ports", async () => {
  const port = await findAvailablePort(45_000);
  const occupiedBefore = await isPortOccupied(port);
  assert.equal(occupiedBefore, false, "Available port should initially be unoccupied");

  const server = http.createServer((_, res) => {
    res.statusCode = 200;
    res.end("OK");
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));

  try {
    const occupiedAfter = await isPortOccupied(port);
    assert.equal(occupiedAfter, true, "Port should be detected as occupied when server is listening");

    const healthy = await checkServerHealth(`http://127.0.0.1:${port}`);
    assert.equal(healthy, true, "HTTP server should be detected as healthy");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("2. Port reuse & custom URL: startLocalServer returns ownedProcess=false when reusing server or custom URL", async () => {
  const customSrv = await startLocalServer(process.cwd(), "http://127.0.0.1:99999").catch(() => undefined);
  assert.equal(customSrv, undefined, "Unreachable custom URL must throw error");

  const port = await findAvailablePort(46_000);
  const dummyServer = http.createServer((_, res) => {
    res.statusCode = 200;
    res.end("OK");
  });

  await new Promise<void>((resolve) => dummyServer.listen(port, "127.0.0.1", () => resolve()));

  try {
    const srv = await startLocalServer(process.cwd(), `http://127.0.0.1:${port}`);
    assert.equal(srv.ownedProcess, false, "Connecting to external server must set ownedProcess=false");
    
    // Call stop() on non-owned server - should be no-op and not close dummyServer
    await srv.stop();
    const stillHealthy = await checkServerHealth(`http://127.0.0.1:${port}`);
    assert.equal(stillHealthy, true, "Stopping non-owned server MUST NOT terminate external process");
  } finally {
    await new Promise<void>((resolve) => dummyServer.close(() => resolve()));
  }
});

test("3. Coverage and Scoring: PARTIAL, TIMEOUT, and BLOCKED statuses are categorized accurately", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "SEO", status: "PARTIAL", score: 75, duration: 50 },
    { name: "Accessibility", status: "TIMEOUT", message: "Check timed out after 120s", duration: 120_000 },
    { name: "Lighthouse Performance", status: "BLOCKED", message: "Local server failed to start", duration: 0 },
    { name: "TypeScript", status: "SKIPPED", message: "Skipped in fast profile", duration: 0 },
    { name: "SwiftLint", status: "NOT_APPLICABLE", message: "Not a Swift project", duration: 0 },
  ];

  const coverage = calculateScanCoverage(results);
  assert.equal(coverage.applicableScanners, 5, "5 applicable scanners (excluding NOT_APPLICABLE)");
  assert.equal(coverage.executedSuccessfully, 2, "2 executed successfully (PASS + PARTIAL)");
  assert.equal(coverage.partial, 1, "1 partial scanner");
  assert.equal(coverage.timedOut, 1, "1 timed out scanner");
  assert.equal(coverage.blocked, 1, "1 blocked scanner");

  const overallScore = calculateOverallScore(results);
  assert.equal(overallScore, 83, "Overall score averages PASS (100) and PARTIAL (75) with SEO weighting");
});

test("4. Quality Gate: TIMEOUT, BLOCKED, and PARTIAL result in INCOMPLETE or FAILED gate status", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "Accessibility", status: "TIMEOUT", message: "Timed out", duration: 120_000 },
  ];

  const gate = evaluateCurrentQualityGate(results, 100);
  assert.equal(gate.passed, false, "Gate fails/incompleted when check times out");
  assert.equal(gate.status, "FAILED", "Timeout checks count as failing checks in gate");
  assert.ok(gate.reasons.some((r) => r.includes("Accessibility timeout")), "Reason includes Accessibility timeout");
});

test("5. Baseline Comparability: Transitioning FAIL -> TIMEOUT, FAIL -> BLOCKED, or FAIL -> SKIPPED is INCOMPARABLE", () => {
  const prevResults: CheckResult[] = [
    {
      name: "SEO",
      status: "FAIL",
      duration: 50,
      data: { issues: [{ type: "missing_title", route: "/about", message: "Missing title" }] },
    },
  ];
  const curResults: CheckResult[] = [
    { name: "SEO", status: "TIMEOUT", message: "Check timed out", duration: 120_000 },
  ];

  const prev = createMockReport(prevResults, 50);
  const cur = createMockReport(curResults, 0);

  const comp = compareWithBaseline(cur, prev);
  assert.ok(comp);

  const states = comp.categorizedIssues.scannerComparisonStates || [];
  assert.equal(states.length, 1);
  assert.equal(states[0]?.status, "UNAVAILABLE", "FAIL -> TIMEOUT must be marked UNAVAILABLE / INCOMPARABLE");

  assert.equal(comp.categorizedIssues.fixedIssues.length, 0, "Missing title from timed out scanner MUST NOT be counted as FIXED!");
});

test("6. Profiles: fast profile skips runtime checks with status SKIPPED and skipReason", async () => {
  const mockContext: QAContext = {
    projectPath: process.cwd(),
    reportDir: "./reports",
    detection: { detected: true, framework: "Next.js", projectPath: process.cwd() },
    framework: "Next.js",
    pipeline: "Next.js",
    config: { profile: "fast" },
    routes: ["/"],
    logger: { header() {}, section() {}, start() {}, result() {}, footer() {} } as any,
    environment: { nodeVersion: process.version, platform: process.platform, ci: false },
    runtime: new PipelineRuntime(process.cwd(), "./reports", { profile: "fast" }),
  };

  const runtimeCheck = { name: "SEO", category: "seo", run: async () => ({ name: "SEO", status: "PASS" as const, duration: 10 }) };
  const staticCheck = { name: "Build", category: "build", run: async () => ({ name: "Build", status: "PASS" as const, duration: 10 }) };

  const runtimeResult = await executeCheck(runtimeCheck, mockContext);
  assert.equal(runtimeResult.status, "SKIPPED", "Runtime check in fast profile must be SKIPPED");
  assert.equal(runtimeResult.skipReason, "Skipped in fast profile");

  const staticResult = await executeCheck(staticCheck, mockContext);
  assert.equal(staticResult.status, "PASS", "Static check in fast profile must run normally");
});

test("7. Next.js lint compatibility: runLint detects Next.js project structure", async () => {
  const result = await runLint(process.cwd());
  assert.ok(typeof result.totalIssues === "number", "runLint should return structured result without crashing");
});
