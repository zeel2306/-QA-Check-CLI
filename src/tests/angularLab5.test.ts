import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs/promises";
import { findStaticRootDir, hasBuiltStaticOutput } from "../core/runner.js";
import { AngularPipeline } from "../pipeline/angular.pipeline.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { discoverRoutes } from "../crawler.js";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";
import { BrokenImagesCheck } from "../checks/brokenImages.js";
import { evaluateCurrentQualityGate } from "../core/report.js";
import type { CheckResult } from "../types/result.js";

import fsSync from "fs";

const FIXTURE_PATH =
  process.env.LAB_05_PATH ||
  (fsSync.existsSync("D:/qa-check-testing-projects/qa-check-lab-05-angular-ts")
    ? "D:/qa-check-testing-projects/qa-check-lab-05-angular-ts"
    : undefined);

test("1. findStaticRootDir resolves Angular dist/*/browser output path", (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 05 fixture not available on system");
    return;
  }
  const root = findStaticRootDir(FIXTURE_PATH);
  assert.ok(root.replace(/\\/g, "/").toLowerCase().includes("dist/"), `Expected dist/* output path, got: ${root}`);
  assert.equal(hasBuiltStaticOutput(FIXTURE_PATH), true);
});

test("2. AngularPipeline registers all 13 checks", (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 05 fixture not available on system");
    return;
  }
  const runtime = new PipelineRuntime(FIXTURE_PATH, "reports", {});
  const pipeline = new AngularPipeline(runtime);
  const checks = pipeline.checks();

  assert.equal(checks.length, 13, `Expected 13 checks in Angular pipeline, got ${checks.length}`);
  const checkNames = checks.map((c) => c.name);
  assert.ok(checkNames.includes("Build"));
  assert.ok(checkNames.includes("Angular Lint"));
  assert.ok(checkNames.includes("TypeScript"));
  assert.ok(checkNames.includes("Code Quality Insights"));
  assert.ok(checkNames.includes("Route Discovery"));
  assert.ok(checkNames.includes("Responsive"));
  assert.ok(checkNames.includes("Accessibility"));
  assert.ok(checkNames.includes("Lighthouse Performance"));
  assert.ok(checkNames.includes("Performance"));
  assert.ok(checkNames.includes("Broken Links"));
  assert.ok(checkNames.includes("Broken Images"));
  assert.ok(checkNames.includes("Console Errors"));
  assert.ok(checkNames.includes("Network Errors"));
});

test("3. Route Discovery detects 5 Angular application routes", async (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 05 fixture not available on system");
    return;
  }
  const { framework, routes } = await discoverRoutes(FIXTURE_PATH);
  assert.equal(framework, "Angular");
  assert.deepEqual(routes, ["/", "/contact", "/dashboard", "/products", "/profile"]);
});

test("4. BrokenLinksCheck parses Angular routerLink and href='#'", async (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 05 fixture not available on system");
    return;
  }
  const check = new BrokenLinksCheck(async () => undefined as any);
  const result = await check.run(FIXTURE_PATH);
  assert.ok(result.status === "FAIL" || result.status === "WARNING");
  const issues = (result.data as any)?.issues || [];

  const ghostIssue = issues.find((i: any) => i.url?.includes("ghost") || i.target?.includes("ghost"));
  assert.ok(ghostIssue, "Should detect broken internal link for /ghost");

  const hashIssue = issues.find((i: any) => i.type === "suspicious-hash-link");
  assert.ok(hashIssue, "Should detect suspicious hash link for href='#'");
});

test("5. BrokenImagesCheck parses Angular [src] and finds missing image assets", async (t) => {
  if (!FIXTURE_PATH || !fsSync.existsSync(FIXTURE_PATH)) {
    t.skip("Lab 05 fixture not available on system");
    return;
  }
  const check = new BrokenImagesCheck(async () => undefined as any);
  const result = await check.run(FIXTURE_PATH);
  assert.equal(result.status, "FAIL");
  const issues = (result.data as any)?.issues || [];

  const heroIssue = issues.find((i: any) => i.url?.includes("missing-angular-hero.jpg"));
  assert.ok(heroIssue, "Should detect missing image asset missing-angular-hero.jpg");
});

test("6. evaluateCurrentQualityGate outputs INCOMPLETE status and PARTIAL confidence when scanner is SKIPPED", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", duration: 10 },
    { name: "Lighthouse", status: "SKIPPED", message: "Server not available", duration: 0 },
  ];

  const gate = evaluateCurrentQualityGate(results, 100);
  assert.equal(gate.passed, false);
  assert.equal(gate.status, "INCOMPLETE");
  assert.equal(gate.confidence, "PARTIAL");
  assert.equal(gate.confidencePercent, 50);
  assert.ok(gate.reasons.some((r) => r.includes("incomplete")));
});
