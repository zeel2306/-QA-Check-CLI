import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { isExcludedDir, isProjectSourceFile } from "../utils/sourcePolicy.js";
import { CssValidationCheck } from "../checks/project.js";
import { evaluateCurrentQualityGate } from "../core/report.js";
import { compareWithBaseline } from "../baseline/compare.js";
import { discoverDeclaredApplicationRoutes } from "../crawler.js";
import type { AuditReport, CheckResult } from "../types/result.js";
import { reliabilityFixture } from './reliabilityFixture.js';

test("Issue 4: Excludes report directories and report files from source policy", () => {
  assert.equal(isExcludedDir("reports"), true);
  assert.equal(isExcludedDir("qa-reports"), true);
  assert.equal(isExcludedDir("history"), true);
  assert.equal(isExcludedDir("artifacts"), true);

  assert.equal(isProjectSourceFile("reports/report.html", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.html", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.json", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.md", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.pdf", process.cwd()), false);
  assert.equal(isProjectSourceFile("src/index.ts", process.cwd()), true);
});

test("Issue 5: Reports NOT_APPLICABLE when 0 CSS files exist", async () => {
  const cssCheck = new CssValidationCheck();
  const mockEmptyDir = path.resolve(process.cwd(), "src/tests");
  const result = await cssCheck.run(mockEmptyDir);
  assert.equal(result.status, "NOT_APPLICABLE");
  assert.ok((result.message ?? "").includes("No CSS files found"));
});

test("Issue 3: Evaluates fast profile quality gate as PASSED with FAST_PROFILE confidence when static checks pass", () => {
  const fastResults: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "TypeScript", status: "PASS", score: 100, duration: 10 },
    { name: "ESLint", status: "PASS", score: 100, duration: 10 },
    { name: "CSS Validation", status: "NOT_APPLICABLE", duration: 5 },
    { name: "SEO", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
    { name: "Accessibility", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
    { name: "Lighthouse Performance", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
  ];

  const gate = evaluateCurrentQualityGate(fastResults, 100, { profile: "fast" });
  assert.equal(gate.status, "PASSED");
  assert.equal(gate.passed, true);
  assert.equal(gate.confidence, "FAST_PROFILE");
  assert.equal((gate.erroredChecks ?? []).length, 0);
});

test("Issue 1: Detects scope mismatch between full and fast scans and marks missing categories INCOMPARABLE", () => {
  const fullReport: AuditReport = {
    version: 2,
    projectPath: "/mock/lab",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation", "SEO", "Accessibility"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 5000,
    overallScore: 60,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "FAIL", score: 40, duration: 500 },
      { name: "Accessibility", status: "FAIL", score: 40, duration: 500 },
    ],
  };

  const fastReport: AuditReport = {
    version: 2,
    projectPath: "/mock/lab",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation"],
    checksSkipped: ["SEO", "Accessibility"],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 1000,
    overallScore: 100,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
      { name: "Accessibility", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
    ],
  };

  const comparison = compareWithBaseline(fastReport, fullReport);
  assert.ok(comparison);
  assert.ok(comparison.overallScore.delta <= 0); // Scope mismatch caps delta at 0 instead of false +40 improvement

  const seoCat = comparison.categoryScores.find((c) => c.category === "SEO");
  assert.equal(seoCat?.status, "INCOMPARABLE");

  const accessCat = comparison.categoryScores.find((c) => c.category === "Accessibility");
  assert.equal(accessCat?.status, "INCOMPARABLE");
});

test("Issue 2: Discovers extensionless HTML routes for HTML projects", async (t) => {
  const routes = await discoverDeclaredApplicationRoutes(await reliabilityFixture(t));
  assert.ok(routes.length > 0);
  assert.ok(routes.includes("/page-01"));
  assert.ok(routes.includes('/page-01.html'));
});
