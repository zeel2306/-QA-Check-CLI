import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import http from "http";
import { isExcludedDir, isProjectSourceFile } from "../utils/sourcePolicy.js";
import { BrokenLinksCheck, checkUrl } from "../checks/brokenLinks.js";
import { compareWithBaseline } from "../baseline/compare.js";
import { discoverRoutes, discoverDeclaredApplicationRoutes } from "../crawler.js";
import type { AuditReport, CheckResult } from "../types/result.js";

import { reliabilityFixture } from './reliabilityFixture.js';

test("1. A 38-route project discovery", async (t) => {
  const { framework, routes } = await discoverRoutes(await reliabilityFixture(t));
  assert.equal(framework, "HTML");
  assert.equal(routes.length, 38);
});

test("2. A valid extensionless route resolution", async (t) => {
  const root = await reliabilityFixture(t);
  const { routes: pages } = await discoverRoutes(root);
  assert.ok(pages.includes('/page-01.html'));
  const routes = await discoverDeclaredApplicationRoutes(root);
  assert.ok(routes.includes("/page-01"));
  assert.ok(routes.includes('/page-01.html'));
  assert.ok(!routes.includes('/public/page-01'));
  assert.ok(!routes.includes('/ghost'));
});

test("3. A source file under public/ served at a different URL", async (t) => {
  const { routes } = await discoverRoutes(await reliabilityFixture(t));
  assert.ok(!routes.includes("/public/page-01.html"));
  assert.ok(routes.includes("/page-01.html"));
});

test("4. An unreachable internal link returns HTTP 0 or status 404", async () => {
  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end("Not Found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const targetUrl = `http://127.0.0.1:${port}/unreachable-404`;

  try {
    const status = await checkUrl(targetUrl, 1000);
    assert.equal(status, 404);
  } finally {
    server.close();
  }
});

test("5. A hanging HTTP request times out cleanly", async () => {
  const server = http.createServer((_req, _res) => {
    // Intentionally never respond to simulate hanging connection
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const targetUrl = `http://127.0.0.1:${port}/hanging`;

  const start = performance.now();
  try {
    const status = await checkUrl(targetUrl, 500); // 500ms timeout
    const duration = performance.now() - start;
    assert.equal(status, 0);
    assert.ok(duration < 2500, `Hanging request must complete within bounded timeout (took ${duration}ms)`);
  } finally {
    server.close();
  }
});

test("6. HEAD failure with GET fallback", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "HEAD") {
      res.statusCode = 405; // Method Not Allowed
      res.end();
    } else if (req.method === "GET") {
      res.statusCode = 200;
      res.end("OK");
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const targetUrl = `http://127.0.0.1:${port}/fallback`;

  try {
    const status = await checkUrl(targetUrl, 1000);
    assert.equal(status, 200);
  } finally {
    server.close();
  }
});

test("7. Fast-to-full baseline comparison returns INCOMPARABLE overall quality", () => {
  const fastReport: AuditReport = {
    version: 2,
    projectPath: "/mock/project",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation"],
    checksSkipped: ["SEO", "Accessibility"],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 1000,
    overallScore: 99,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
      { name: "Accessibility", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
    ],
  };

  const fullReport: AuditReport = {
    version: 2,
    projectPath: "/mock/project",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation", "SEO", "Accessibility"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 5000,
    overallScore: 71,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "FAIL", score: 50, duration: 500 },
      { name: "Accessibility", status: "FAIL", score: 60, duration: 500 },
    ],
  };

  const comparison = compareWithBaseline(fullReport, fastReport);
  assert.ok(comparison);
  const qualityCat = comparison.categoryScores.find((c) => c.category === "Quality");
  assert.equal(qualityCat?.status, "INCOMPARABLE");
  assert.equal(comparison.qualityGate.scoreRegressed, false);
});

test("8. Full-to-fast baseline comparison returns INCOMPARABLE overall quality", () => {
  const fastReport: AuditReport = {
    version: 2,
    projectPath: "/mock/project",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation"],
    checksSkipped: ["SEO", "Accessibility"],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 1000,
    overallScore: 99,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
      { name: "Accessibility", status: "SKIPPED", skipReason: "Skipped in fast profile", duration: 0 },
    ],
  };

  const fullReport: AuditReport = {
    version: 2,
    projectPath: "/mock/project",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation", "SEO", "Accessibility"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 5000,
    overallScore: 71,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "FAIL", score: 50, duration: 500 },
      { name: "Accessibility", status: "FAIL", score: 60, duration: 500 },
    ],
  };

  const comparison = compareWithBaseline(fastReport, fullReport);
  assert.ok(comparison);
  const qualityCat = comparison.categoryScores.find((c) => c.category === "Quality");
  assert.equal(qualityCat?.status, "INCOMPARABLE");
});

test("9. Same-profile baseline comparison evaluates score change accurately", () => {
  const fullReport1: AuditReport = {
    version: 2,
    projectPath: "/mock/project",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation", "SEO"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 5000,
    overallScore: 80,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "WARNING", score: 60, duration: 500 },
    ],
  };

  const fullReport2: AuditReport = {
    version: 2,
    projectPath: "/mock/project",
    framework: "HTML",
    pipeline: "HTML",
    checksExecuted: ["HTML Validation", "SEO"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 5000,
    overallScore: 80,
    results: [
      { name: "HTML Validation", status: "PASS", score: 100, duration: 10 },
      { name: "SEO", status: "WARNING", score: 60, duration: 500 },
    ],
  };

  const comparison = compareWithBaseline(fullReport2, fullReport1);
  assert.ok(comparison);
  const qualityCat = comparison.categoryScores.find((c) => c.category === "Quality");
  assert.equal(qualityCat?.status, "STABLE");
  assert.equal(comparison.qualityGate.passed, true);
});

test("10. Stable generated report exclusion from source policy", () => {
  assert.equal(isExcludedDir("reports"), true);
  assert.equal(isExcludedDir("qa-reports"), true);
  assert.equal(isExcludedDir("history"), true);
  assert.equal(isExcludedDir("artifacts"), true);

  assert.equal(isProjectSourceFile("reports/report.html", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.html", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.json", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.md", process.cwd()), false);
  assert.equal(isProjectSourceFile("report.pdf", process.cwd()), false);
});
