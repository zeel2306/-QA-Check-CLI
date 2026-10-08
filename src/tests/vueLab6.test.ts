import test from "node:test";
import assert from "node:assert/strict";
import { detectProjectFramework } from "../framework.js";
import { discoverRoutes, classifyRoute } from "../crawler.js";
import { concreteRoutes } from "../core/browser.js";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";
import { BrokenImagesCheck } from "../checks/brokenImages.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { calculateScanCoverage, calculateOverallScore } from "../core/report.js";
import type { CheckResult } from "../types/result.js";

import fsSync from "fs";

const FIXTURE_PATH =
  process.env.LAB_06_PATH ||
  (fsSync.existsSync("D:/qa-check-testing-projects/qa-check-lab-06-vue-vite-ts")
    ? "D:/qa-check-testing-projects/qa-check-lab-06-vue-vite-ts"
    : undefined);

test("1. VueDetector recognizes Vue dependency and .vue files", (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 06 fixture not available on system");
    return;
  }
  const res = detectProjectFramework(FIXTURE_PATH);
  assert.equal(res.framework, "Vue");
});

test("2 & 3 & 4 & 5 & 15. Route discovery and classification for Vue projects", async (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 06 fixture not available on system");
    return;
  }
  const { framework, routes } = await discoverRoutes(FIXTURE_PATH);

  assert.equal(framework, "Vue");
  assert.ok(routes.includes("/"));
  assert.ok(routes.includes("/products"));
  assert.ok(routes.includes("/contact"));
  assert.ok(routes.includes("/dashboard"));
  assert.ok(routes.includes("/profile/:id"));
  assert.ok(routes.includes("/profile/42"));

  assert.equal(classifyRoute("/profile/:id"), "dynamic");
  assert.equal(classifyRoute("/products"), "static");

  const browserRoutes = concreteRoutes(routes);
  assert.ok(browserRoutes.includes("/profile/42"));
  assert.ok(!browserRoutes.includes("/profile/:id"));
});

test("6 & 7 & 8 & 11 & 18. BrokenLinksCheck detects static & runtime broken Vue links and href='#'", async (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 06 fixture not available on system");
    return;
  }
  const check = new BrokenLinksCheck();
  const res = await check.run(FIXTURE_PATH);

  assert.equal(res.status, "FAIL");
  const issues = (res.data as any)?.issues || [];
  assert.ok(issues.some((i: any) => i.url === "/ghost" || i.target === "/ghost"));
  assert.ok(issues.some((i: any) => i.url === "#" && i.type === "suspicious-hash-link"));
  assert.ok(!issues.some((i: any) => i.url === "/profile/42" && i.type === "broken-internal-link"));
});

test("9 & 10 & 17. BrokenImagesCheck detects Vue missing image assets statically & at runtime", async (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 06 fixture not available on system");
    return;
  }
  const runtime = new PipelineRuntime(FIXTURE_PATH, "./test-reports");
  const check = new BrokenImagesCheck(() => runtime.browserAudit());
  try {
    const res = await check.run(FIXTURE_PATH);
    assert.equal(res.status, "FAIL");
    const issues = (res.data as any)?.issues || [];
    assert.ok(issues.some((i: any) => i.url.includes("missing-vue-hero.jpg")));
  } finally {
    await runtime.stop();
  }
});

test("17. NOT_APPLICABLE lint semantics and coverage denominator exclusion", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "ESLint", status: "NOT_APPLICABLE", message: "No config", duration: 0 },
    { name: "TypeScript", status: "PASS", score: 100, duration: 10 },
  ];

  const coverage = calculateScanCoverage(results);
  assert.equal(coverage.applicableScanners, 2);
  assert.equal(coverage.notApplicable, 1);
  assert.equal(coverage.executedSuccessfully, 2);
  assert.equal(coverage.coveragePercent, 100);

  const overall = calculateOverallScore(results);
  assert.equal(overall, 100);
});
