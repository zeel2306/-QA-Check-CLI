import test from "node:test";
import assert from "node:assert/strict";
import fsSync from "fs";
import { crawlLaravelRoutes, discoverRoutes } from "../crawler.js";
import { LaravelPipeline } from "../pipeline/laravel.pipeline.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { BladeValidationCheck } from "../checks/project.js";
import { LaravelSecurityCheck } from "../checks/laravelSecurity.js";
import { sanitizeAnsi, sanitizeSensitiveData } from "../utils/ansi.js";
import { correlateCanonicalDefects } from "../core/canonical.js";
import { matchesDeclaredRoute } from "../utils/routes.js";
import type { CheckResult } from "../types/result.js";

const LAB_09_PATH =
  process.env.LAB_09_PATH ||
  (fsSync.existsSync("D:/qa-check-testing-projects/QA_Check_Lab_09_Laravel_PHP_API")
    ? "D:/qa-check-testing-projects/QA_Check_Lab_09_Laravel_PHP_API"
    : undefined);

test("crawlLaravelRoutes discovers Laravel API routes", async (t) => {
  if (!LAB_09_PATH || !fsSync.existsSync(LAB_09_PATH)) {
    t.skip("Lab 09 fixture not available on system");
    return;
  }
  const routes = await crawlLaravelRoutes(LAB_09_PATH);
  assert.ok(routes.length >= 8, `Expected at least 8 Laravel routes, got ${routes.length}`);
  assert.ok(routes.some((r) => r.includes("/api/health")), "Should discover /api/health");
  assert.ok(routes.some((r) => r.includes("/api/products")), "Should discover /api/products");
  assert.ok(routes.some((r) => r.includes("/api/products/{id}")), "Should discover /api/products/{id}");
  assert.ok(routes.some((r) => r.includes("/api/orders")), "Should discover /api/orders");
  assert.ok(routes.some((r) => r.includes("/api/login")), "Should discover /api/login");
});

test("discoverRoutes identifies Laravel framework and routes", async (t) => {
  if (!LAB_09_PATH || !fsSync.existsSync(LAB_09_PATH)) {
    t.skip("Lab 09 fixture not available on system");
    return;
  }
  const discovery = await discoverRoutes(LAB_09_PATH);
  assert.equal(discovery.framework, "Laravel");
  assert.ok(discovery.routes.length >= 8);
});

test("matchesDeclaredRoute supports Laravel curly bracket parameters", () => {
  assert.ok(matchesDeclaredRoute("/api/products/123", "GET /api/products/{id}"));
  assert.ok(matchesDeclaredRoute("/api/products/abc", "/api/products/{id}"));
  assert.ok(!matchesDeclaredRoute("/api/products/123/456", "/api/products/{id}"));
});

test("BladeValidationCheck returns NOT_APPLICABLE when no .blade.php files exist in user project", async (t) => {
  if (!LAB_09_PATH || !fsSync.existsSync(LAB_09_PATH)) {
    t.skip("Lab 09 fixture not available on system");
    return;
  }
  const check = new BladeValidationCheck();
  const res = await check.run(LAB_09_PATH);
  assert.equal(res.status, "NOT_APPLICABLE");
  assert.equal(res.skipReason, "API-only or non-Blade Laravel project");
});

test("LaravelSecurityCheck detects security rules SEC-LAR-001 through SEC-LAR-005", async (t) => {
  if (!LAB_09_PATH || !fsSync.existsSync(LAB_09_PATH)) {
    t.skip("Lab 09 fixture not available on system");
    return;
  }
  const check = new LaravelSecurityCheck();
  const res = await check.run(LAB_09_PATH);
  assert.equal(res.status, "FAIL");
  assert.ok(res.data);
  assert.ok(res.data.totalFindings > 0, "Should detect security findings in Lab 09");

  const ruleIds = res.data.findings.map((f) => f.ruleId);
  assert.ok(ruleIds.includes("SEC-LAR-001"), "Should detect SEC-LAR-001 (APP_DEBUG=true in .env.example)");
  assert.ok(ruleIds.includes("SEC-LAR-002"), "Should detect SEC-LAR-002 (Missing auth on sensitive endpoints)");
  assert.ok(ruleIds.includes("SEC-LAR-003"), "Should detect SEC-LAR-003 (Missing rate limit throttle on auth)");
  assert.ok(ruleIds.includes("SEC-LAR-004"), "Should detect SEC-LAR-004 (Static token return without credential validation)");
  assert.ok(ruleIds.includes("SEC-LAR-005"), "Should detect SEC-LAR-005 (Unprotected HTTP write endpoints)");
});

test("Sensitive data sanitization redacts authorization, cookies, and secret tokens", () => {
  const dirtyStr = "Authorization: Bearer secret-token-12345 and Cookie: session_id=xyz987";
  const cleanStr = sanitizeSensitiveData(dirtyStr);
  assert.ok(!cleanStr.includes("secret-token-12345"), "Bearer token must be redacted");
  assert.ok(!cleanStr.includes("xyz987"), "Cookie value must be redacted");
  assert.ok(cleanStr.includes("[REDACTED]"));

  const obj = {
    authorization: "Bearer secret-token-12345",
    cookie: "session_id=xyz",
    "x-api-key": "secret-key",
    normalField: "public-data",
  };
  const cleanObj = sanitizeAnsi(obj);
  assert.equal(cleanObj.authorization, "[REDACTED]");
  assert.equal(cleanObj.cookie, "[REDACTED]");
  assert.equal(cleanObj["x-api-key"], "[REDACTED]");
  assert.equal(cleanObj.normalField, "public-data");
});

test("correlateCanonicalDefects handles Laravel Security findings under Security category", () => {
  const results: CheckResult[] = [
    {
      name: "Laravel Security",
      status: "FAIL",
      score: 40,
      duration: 50,
      data: {
        totalFindings: 2,
        findings: [
          {
            ruleId: "SEC-LAR-001",
            severity: "MEDIUM",
            confidence: "HIGH",
            file: ".env.example",
            target: ".env.example",
            evidence: "APP_DEBUG=true",
            explanation: "Unsafe production debug configuration",
            remediation: "Set APP_DEBUG=false",
          },
          {
            ruleId: "SEC-LAR-002",
            severity: "HIGH",
            confidence: "HIGH",
            file: "routes/api.php",
            target: "GET /api/orders",
            evidence: "Missing auth middleware",
            explanation: "Sensitive route exposed without auth",
            remediation: "Add auth middleware",
          },
        ],
      },
    },
  ];

  const canonical = correlateCanonicalDefects(results);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0]!.category, "Security");
  assert.equal(canonical[1]!.category, "Security");
  assert.ok(canonical.some((c: { canonicalTarget: string }) => c.canonicalTarget.includes(".env.example")));
  assert.ok(canonical.some((c: { canonicalTarget: string }) => c.canonicalTarget.includes("GET /api/orders")));
});

test("LaravelPipeline includes Route Discovery, Security Check, and API Testing", () => {
  const runtime = new PipelineRuntime("/mock/path", "/mock/report");
  const pipeline = new LaravelPipeline(runtime);
  const checks = pipeline.checks();

  const names = checks.map((c) => c.name);
  assert.ok(names.includes("Route Discovery"), "Should include Route Discovery");
  assert.ok(names.includes("Laravel Security"), "Should include Laravel Security");
  assert.ok(names.includes("API Testing"), "Should include API Testing");
  assert.ok(names.includes("Composer Validation"), "Should include Composer Validation");
  assert.ok(names.includes("Blade Validation"), "Should include Blade Validation");
});
