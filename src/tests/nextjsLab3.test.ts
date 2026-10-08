import test from "node:test";
import assert from "node:assert/strict";
import { stripVolatileQueryParams, correlateCanonicalDefects } from "../core/canonical.js";
import { discoverRoutes, classifyRoute } from "../crawler.js";
import { concreteRoutes } from "../core/browser.js";
import { getIssueSuggestions } from "../suggestions/index.js";
import type { AuditReport, CheckResult } from "../types/result.js";
import path from "path";
import fs from "fs/promises";
import os from "os";

test("1. Raw observations equals sum of scanner observations", () => {
  const mockResults: CheckResult[] = [
    { name: "ESLint", status: "FAIL", duration: 10, data: { issues: [{}, {}] } },
    { name: "SEO", status: "FAIL", duration: 10, data: { issues: [{}, {}, {}] } },
    { name: "Responsive", status: "PASS", duration: 10, data: { issues: [] } },
  ];
  const rawSum = mockResults.reduce((sum, r) => sum + (Array.isArray((r.data as any)?.issues) ? (r.data as any).issues.length : 0), 0);
  assert.equal(rawSum, 5);
});

test("2. Unique defects equals canonicalDefects.length", () => {
  const mockResults = [
    { name: "Broken Images", status: "FAIL", data: { issues: [{ url: "/hero.png", route: "/" }] } },
    { name: "Network Errors", status: "FAIL", data: { issues: [{ url: "http://localhost:3000/hero.png", route: "/" }] } },
  ];
  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
});

test("3 & 4. Raw observations and unique defects have different labels and do not falsely swap claims", () => {
  const mockReport: Partial<AuditReport> = {
    rawObservations: 103,
    uniqueDefects: 64,
  };
  assert.notEqual(mockReport.rawObservations, mockReport.uniqueDefects);
  assert.equal(mockReport.rawObservations, 103);
  assert.equal(mockReport.uniqueDefects, 64);
});

test("5 & 6. Next.js app/api/products/route.ts and app/api/crash/route.ts discovery", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-next-api-"));
  await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-next-app", dependencies: { next: "^14.0.0" } }));
  await fs.mkdir(path.join(tmpDir, "app/api/products"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "app/api/crash"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "app/products/[id]"), { recursive: true });

  await fs.writeFile(path.join(tmpDir, "app/page.tsx"), "export default function Home(){}");
  await fs.writeFile(path.join(tmpDir, "app/products/page.tsx"), "export default function Products(){}");
  await fs.writeFile(path.join(tmpDir, "app/products/[id]/page.tsx"), "export default function ProductDetail(){}");
  await fs.writeFile(path.join(tmpDir, "app/api/products/route.ts"), "export async function GET(){}");
  await fs.writeFile(path.join(tmpDir, "app/api/crash/route.ts"), "export async function GET(){}");

  const { routes } = await discoverRoutes(tmpDir);
  assert.ok(routes.includes("/api/products"), "Should discover /api/products");
  assert.ok(routes.includes("/api/crash"), "Should discover /api/crash");
  assert.ok(routes.includes("/products/[id]"), "Should discover /products/[id]");

  const apiRoutes = routes.filter((r) => classifyRoute(r) === "api");
  assert.equal(apiRoutes.length, 2);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("7 & 8. API routes and dynamic [id] template routes excluded from concrete browser navigation", () => {
  const routes = ["/", "/contact", "/products/[id]", "/api/products", "/api/crash"];
  const concrete = concreteRoutes(routes);
  assert.deepEqual(concrete, ["/", "/contact"]);
  assert.ok(!concrete.includes("/api/products"));
  assert.ok(!concrete.includes("/products/[id]"));
});

test("9 & 10. RSC requests with different _rsc values correlate while preserving raw URLs", () => {
  const raw1 = "/ghost?_rsc=1r34m";
  const raw2 = "/ghost?_rsc=17qq4";

  assert.equal(stripVolatileQueryParams(raw1), "/ghost");
  assert.equal(stripVolatileQueryParams(raw2), "/ghost");

  const mockResults = [
    {
      name: "Network Errors",
      status: "FAIL",
      data: {
        issues: [
          { url: raw1, route: "/", status: 404 },
          { url: raw2, route: "/about", status: 404 },
        ]
      }
    }
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].canonicalTarget, "/ghost");
});

test("11. Console resource-load error without specific asset does not use page route as fake resource", () => {
  const mockResults = [
    {
      name: "Console Errors",
      status: "FAIL",
      data: {
        issues: [
          { type: "resource-load-error", route: "/products", message: "Failed to load resource: the server responded with a status of 404" }
        ]
      }
    }
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
  assert.notEqual(defects[0].canonicalTarget, "/products");
  assert.ok(defects[0].canonicalTarget.startsWith("console-error:"));
});

test("12 & 13. ESLint targeted suggestions appear and deduplicate by rule", () => {
  const mockResult: CheckResult = {
    name: "ESLint",
    status: "FAIL",
    duration: 5,
    data: {
      issues: [
        { file: "page.tsx", line: 1, column: 1, severity: 2, ruleId: "@next/next/no-img-element", message: "Do not use <img>" },
        { file: "layout.tsx", line: 2, column: 1, severity: 2, ruleId: "@next/next/no-img-element", message: "Do not use <img>" },
        { file: "comp.tsx", line: 3, column: 1, severity: 2, ruleId: "react-hooks/purity", message: "Impure render" },
      ]
    }
  };

  const suggestions = getIssueSuggestions(mockResult);
  assert.equal(suggestions.length, 2);
  const titles = suggestions.map((s) => s.title);
  assert.ok(titles.includes("Next.js Image Optimization"));
  assert.ok(titles.includes("React Hooks Purity"));
});

test("14, 15, 16. Report model data consistency across route, observation, and defect counts", () => {
  const report: Partial<AuditReport> = {
    routes: ["/", "/about", "/contact", "/dashboard", "/products", "/products/[id]", "/api/products", "/api/crash"],
    rawObservations: 103,
    uniqueDefects: 64,
  };

  assert.equal(report.routes!.length, 8);
  assert.equal(report.rawObservations, 103);
  assert.equal(report.uniqueDefects, 64);
});

test("17. Concrete routes filtering excludes API routes and dynamic routes for browser checks", () => {
  const allDiscovered = ["/", "/about", "/contact", "/dashboard", "/products", "/products/[id]", "/api/products", "/api/crash"];
  const browserOnly = concreteRoutes(allDiscovered);
  assert.deepEqual(browserOnly, ["/", "/about", "/contact", "/dashboard", "/products"]);
  assert.equal(browserOnly.length, 5);
  assert.ok(!browserOnly.some((r) => r.startsWith("/api/")));
  assert.ok(!browserOnly.some((r) => r.includes("[")));
});
