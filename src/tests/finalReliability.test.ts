import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ApiTestingCheck, verifyApiTarget } from "../checks/api.js";
import { PipelineRuntime, LazyApiTestingCheck } from "../pipeline/runtime.js";
import { ResponsiveCheck } from "../checks/responsive.js";
import { AccessibilityCheck } from "../checks/accessibility.js";
import { BrokenImagesCheck } from "../checks/brokenImages.js";
import { LaravelSecurityCheck } from "../checks/laravelSecurity.js";
import { writeHtmlReport } from "../reporters/html.js";
import { runBrowserAudit } from "../core/browser.js";
import { startLocalServer } from "../core/runner.js";
import { correlateCanonicalDefects, alignSourceRoutes } from "../core/canonical.js";
import { parseApiTestCases } from "../core/config.js";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import { compareWithBaseline } from "../baseline/compare.js";
import { calculateScanCoverage, evaluateCurrentQualityGate } from "../core/report.js";

async function server(handler: http.RequestListener) {
  const instance = http.createServer(handler);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(instance.address() as any).port}`;
  return { url, close: () => new Promise<void>((resolve) => instance.close(() => resolve())) };
}

test("Real Lighthouse cancellation leaves the CLI alive after closing Chrome", async () => {
  const s = await server((_, response) => { response.setHeader("Content-Type", "text/html"); response.end('<html lang="en"><head><title>Audit</title></head><body>Test</body></html>'); });
  try {
    const result = await new LighthouseCheck(s.url, ["/"], true, 1800).run(".");
    assert.equal(result.status, "TIMEOUT");
    assert.equal(result.score, null);
    // Detached Lighthouse work previously rejected after run returned and killed Node.
    await new Promise(resolve => setTimeout(resolve, 700));
  } finally { await s.close(); }
});

test("External API readiness rejects HTML and wrong application 404", async () => {
  for (const status of [200, 404]) {
    const s = await server((_, res) => { res.writeHead(status, { "Content-Type": "text/html" }); res.end("<html>other app</html>"); });
    try { await assert.rejects(verifyApiTarget({ name: "witness", url: s.url, expect: { status: 200, requiredFields: ["status"] } })); }
    finally { await s.close(); }
  }
  const protectedTarget = await server((req, res) => { res.writeHead(req.headers.authorization === "Bearer verification-only" ? 200 : 401, { "Content-Type": "application/json" }); res.end('{"status":"ok"}'); });
  try { await verifyApiTarget({ name: "protected witness", url: protectedTarget.url, headers: { Authorization: "Bearer verification-only" }, expect: { status: 200, requiredFields: ["status"] } }); }
  finally { await protectedTarget.close(); }
});

test("Multiple configured scenarios preserve expected 404 and distinct contract failures", async () => {
  const s = await server((req, res) => { res.writeHead(req.url === "/missing" ? 404 : 201, { "Content-Type": "application/json" }); res.end('{}'); });
  try {
    const cases = parseApiTestCases({ baseUrl: s.url, tests: [
      { name: "expected missing", path: "/missing", expectedStatus: 404 },
      { name: "negative auth", method: "POST", path: "/orders", expectedStatus: 401 },
      { name: "negative payload", method: "POST", path: "/orders", expectedStatus: 422 },
    ] });
    const result = await new ApiTestingCheck(cases).run("");
    assert.equal(result.data?.passed, 1); assert.equal(result.data?.failed, 2);
    assert.equal(result.data?.testedEndpointsCount, 2);
    assert.equal(correlateCanonicalDefects([result]).length, 2);
  } finally { await s.close(); }
});

test("Connection refusal is blocked and creates no canonical application defect", async () => {
  const s = await server((_, res) => res.end()); await s.close();
  const result = await new ApiTestingCheck([{ name: "refused", url: s.url }]).run("");
  assert.equal(result.status, "BLOCKED"); assert.equal(result.data?.failed, 0);
  assert.equal(correlateCanonicalDefects([result]).length, 0);
});

test("Explicit failing custom URL cannot fall back to another project server", async () => {
  const s = await server((_, res) => { res.statusCode = 503; res.end(); });
  try { await assert.rejects(startLocalServer(process.cwd(), s.url)); }
  finally { await s.close(); }
});

test("API-only Laravel excludes browser routes unless explicitly requested", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-api-only-"));
  try {
    await fs.writeFile(path.join(dir, "artisan"), "");
    assert.deepEqual(await new PipelineRuntime(dir, dir).browserRoutes(), []);
    assert.deepEqual(await new PipelineRuntime(dir, dir, { includeRoutes: ["/selected"] }).browserRoutes(), ["/selected"]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Link verification budget starts after discovery and deduplicates URLs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-link-budget-"));
  const s = await server((_, res) => { res.statusCode = 404; res.end(); });
  try {
    const result = await new BrokenLinksCheck(async () => ({ links: [
      { url: s.url, route: "/", external: false }, { url: s.url, route: "/", external: false },
    ], seo: [], } as any)).run(dir);
    assert.equal(result.status, "FAIL");
    assert.equal((result.data as any).discoveredCount, 1);
    assert.equal((result.data as any).verifiedCount, 1);
    assert.equal((result.data as any).unverifiedCount, 0);
  } finally { await s.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test("Canonical security deduplicates rule and target but preserves separate risks", () => {
  const finding = { ruleId: "SEC-LAR-002", target: "GET /orders", evidence: "auth risk" };
  assert.equal(correlateCanonicalDefects([{ name: "Laravel Security", status: "FAIL", data: { findings: [finding, finding, { ...finding, ruleId: "SEC-LAR-005" }] } }]).length, 2);
});

test("Lighthouse budget prevents further jobs and closes the owned browser after timeout", async () => {
  let launched = 0, killed = 0, audited = 0;
  const runtime = {
    launch: async () => { launched++; return { port: 1234, kill: async () => { killed++; } }; },
    audit: async () => { audited++; return await new Promise(() => {}); },
  } as any;
  const result = await new LighthouseCheck("http://example.test", ["/selected", "/other"], true, 25, runtime).run("");
  assert.equal(result.status, "TIMEOUT"); assert.equal(result.score, null);
  assert.equal(launched, 1); assert.equal(killed, 1); assert.equal(audited, 1);
  assert.equal(result.pagesAttempted, 1); assert.equal(result.pagesCompleted, 0);
});

test("Added scanners and incomplete performance scope do not invent regressions", () => {
  const base = { version: 2, projectPath: "/fixture", finishedAt: "2026-01-01", overallScore: 90, results: [{ name: "Build", status: "PASS", score: 100, duration: 1 }] } as any;
  const current = { ...base, overallScore: 70, results: [...base.results,
    { name: "Laravel Security", status: "FAIL", score: 10, duration: 1, data: { findings: [{ ruleId: "SEC-LAR-001", target: ".env.example" }] } },
    { name: "Lighthouse Performance", status: "PARTIAL", score: 30, duration: 1, metadata: { categoryScores: { performance: 30 } } },
  ] };
  const comparison = compareWithBaseline(current, base);
  assert.ok(comparison);
  assert.equal(comparison.qualityGate.passed, false);
  assert.equal(comparison.qualityGate.scoreRegressed, false);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);
  assert.equal(comparison.categoryScores.find((c) => c.category === "Quality")?.status, "INCOMPARABLE");
  assert.equal(comparison.metricChanges?.length, 0);
  const unchanged = compareWithBaseline(current, current)!;
  assert.equal(unchanged.categoryScores.find((c) => c.category === "Quality")?.status, "INCOMPARABLE");
  assert.equal(unchanged.qualityGate.passed, false);
  assert.equal(unchanged.qualityGate.scoreRegressed, false);
  assert.ok(unchanged.qualityGate.reasons.some(reason => reason.includes("evidence incomplete")));
});

test("Partial execution reduces confidence even when all applicable scanners ran", () => {
  const results = [{ name: "Lighthouse Performance", status: "PARTIAL" as const, score: 90, duration: 1 }];
  assert.equal(calculateScanCoverage(results).coveragePercent, 100);
  assert.equal(evaluateCurrentQualityGate(results, 90).confidence, "PARTIAL");
});

test("Concrete API resource instances count as one declared endpoint", async () => {
  const s = await server((_, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{}'); });
  try {
    const result = await new ApiTestingCheck([{ name: "first", url: s.url + "/products/1" }, { name: "second", url: s.url + "/products/2" }], ["GET /products/{id}"]).run("");
    assert.equal(result.data?.total, 2); assert.equal(result.data?.testedEndpointsCount, 1);
  } finally { await s.close(); }
});

test("Changed target scope is incomparable and does not create application regressions", () => {
  const check = { name: "SEO", status: "WARNING", score: 80, duration: 1, metadata: { scopeKey: "first" }, data: { issues: [{ type: "missing-title", route: "/old" }] } };
  const base = { version: 2, projectPath: "/fixture", finishedAt: "2026-01-01", overallScore: 80, results: [check] } as any;
  const current = { ...base, overallScore: 70, results: [{ ...check, score: 70, metadata: { scopeKey: "second" }, data: { issues: [{ type: "missing-title", route: "/new" }] } }] };
  const comparison = compareWithBaseline(current, base)!;
  assert.equal(comparison.qualityGate.passed, true);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 0);
  assert.equal(comparison.categoryScores.find((c) => c.category === "SEO")?.status, "INCOMPARABLE");
});

test("Explicit API URLs stay on their configured target and writes require a JSON witness", async () => {
  const calls: string[] = [];
  const s = await server((req, res) => { calls.push(req.method + " " + req.url); res.writeHead(200, { "Content-Type": "text/html" }); res.end('<html>wrong application</html>'); });
  try {
    const runtime = new PipelineRuntime(process.cwd(), "unused", { url: s.url, apiTestCases: [
      { name: "witness", url: s.url + "/health", expect: { status: 200, requiredFields: ["status"] } },
      { name: "write", method: "POST", url: s.url + "/orders", body: {}, expect: { status: 401 } },
    ] });
    const result = await new LazyApiTestingCheck(runtime).run(process.cwd());
    assert.equal(result.status, "BLOCKED");
    assert.ok(calls.includes("GET /health"));
    assert.ok(!calls.some((call) => call.startsWith("POST")));
  } finally { await s.close(); }
});

test("Vendor HTML never makes API-only UI checks applicable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-vendor-html-"));
  try {
    await fs.mkdir(path.join(dir, "vendor"));
    await fs.writeFile(path.join(dir, "vendor", "example.html"), '<html><img src="missing.png"><a href="/ghost">link</a><input></html>');
    for (const check of [new ResponsiveCheck(), new AccessibilityCheck(), new BrokenImagesCheck(), new BrokenLinksCheck()]) assert.equal((await check.run(dir)).status, "NOT_APPLICABLE");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Laravel security respects prefixed group middleware and controller authorization", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-middleware-"));
  try {
    await fs.mkdir(path.join(dir, "app/Http/Controllers"), { recursive: true });
    await fs.writeFile(path.join(dir, "app/Http/Controllers/Orders.php"), '<?php class Orders { function store() { $this->authorize("create", Order::class); } }');
    const publicRoute = { method: "GET", uri: "api/users", middleware: ["api"] };
    const result = await new LaravelSecurityCheck(async () => [
      { method: "GET", uri: "api/teams/orders", middleware: ["api", "Illuminate\\Auth\\Middleware\\Authenticate:sanctum"] },
      { method: "POST", uri: "api/login", middleware: ["api", "throttle:6,1"] },
      { method: "POST", uri: "api/teams/orders", middleware: ["api"], action: "App\\Http\\Controllers\\Orders@store" },
      publicRoute, publicRoute,
    ]).run(dir);
    assert.equal(result.data?.totalFindings, 1);
    assert.equal(result.data?.findings[0]?.target, "GET /api/users");
    assert.equal(result.data?.findings[0]?.confidence, "MEDIUM");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Static source and runtime observations share only evidenced route identities", () => {
  const result = { name: "Accessibility", status: "WARNING", data: { issues: [
    { route: "public/page.html", type: "label", message: "missing label" },
    { route: "/page", type: "label", message: "missing label" },
    { route: "public/other.html", type: "label", message: "different page" },
    { route: "/public/page.html", type: "label", message: "same static source", sources: ["static"] },
  ] } };
  alignSourceRoutes(result, ["/page"]);
  assert.equal(correlateCanonicalDefects([result]).length, 2);
  assert.equal(result.data.issues[2]?.route, "public/other.html");
});

test("Lighthouse bounds startup and cleans a browser that finishes launching late", async () => {
  let killed = 0;
  const runtime = { launch: async () => { await new Promise((resolve) => setTimeout(resolve, 50)); return { port: 1, kill: async () => { killed++; } }; }, audit: async () => { throw new Error("Must not audit after launch deadline"); } } as any;
  const result = await new LighthouseCheck("http://example.test", ["/"], true, 15, runtime).run("");
  assert.equal(result.status, "TIMEOUT"); assert.equal(result.pagesAttempted, 0);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(killed, 1);
});

test("Unavailable Laravel middleware resolution preserves an incomplete result", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-unverified-middleware-"));
  try {
    await fs.mkdir(path.join(dir, "routes"));
    await fs.writeFile(path.join(dir, "routes/api.php"), "<?php Route::middleware(['custom.guard'])->group(function () { Route::get('/orders', fn () => []); });");
    const result = await new LaravelSecurityCheck(async () => { throw new Error("Artisan unavailable"); }).run(dir);
    assert.equal(result.status, "PARTIAL"); assert.equal(result.data?.isPartial, true);
    assert.equal(result.score, null);
    assert.equal(result.data?.unverifiedRoutes?.length, 1);
    assert.equal(result.data?.totalFindings, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Configured API writes cannot follow redirects to an unconfigured service", async () => {
  let mutations = 0;
  const destination = await server((_, res) => { mutations++; res.end(); });
  const source = await server((_, res) => { res.writeHead(307, { Location: destination.url }); res.end(); });
  try {
    const result = await new ApiTestingCheck([{ name: "redirected mutation", method: "POST", url: source.url, body: {}, expect: { status: 307 } }]).run("");
    assert.equal(result.status, "PASS"); assert.equal(mutations, 0);
  } finally { await source.close(); await destination.close(); }
});

test("HTML category comparison renders the actual INCOMPARABLE domain status", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-incomparable-html-"));
  try {
    const results = [{ name: "Lighthouse Performance", status: "PARTIAL" as const, score: 80, duration: 1 }];
    const report = { version: 2, projectPath: dir, framework: "HTML", pipeline: "HTML", routes: [], results, overallScore: 80, duration: 1, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), checksExecuted: [], checksSkipped: [], checksNotApplicable: [], coverage: calculateScanCoverage(results) } as any;
    report.baseline = compareWithBaseline(report, report);
    assert.equal(report.baseline.categoryScores.find((item: any) => item.category === "Quality").status, "INCOMPARABLE");
    const output = await writeHtmlReport(report, dir);
    const html = await fs.readFile(output, "utf8");
    assert.match(html.replace(/<[^>]+>/g, ""), /Quality\s*80 → 80\s*⚪ INCOMPARABLE/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Responsive viewports preserve layouts initialized from the viewport at page load", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-initial-viewport-"));
  let owned: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  try {
    await fs.writeFile(path.join(dir, "index.html"), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Initial viewport</title><style>body{margin:0}</style></head><body><main id="sizing"><h1>Viewport layout</h1></main><script>document.getElementById("sizing").style.width=innerWidth>1000?"1000px":"100%";</script></body></html>');
    owned = await startLocalServer(dir);
    const audit = await runBrowserAudit(owned.url, ["/"], path.join(dir, "reports"));
    assert.equal(audit.pageSummary.completed, 1);
    assert.deepEqual(audit.responsive, []);
  } finally { await owned?.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
