import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { isViteProject, findAvailablePort, ServerStartupError } from "../core/runner.js";
import { concreteRoutes } from "../core/browser.js";
import { correlateCanonicalDefects, toCanonicalTargetHref } from "../core/canonical.js";
import { calculateScanCoverage } from "../core/report.js";
import type { CheckResult } from "../types/result.js";

test("1. Vite project detection recognizes vite configs and dependencies", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-test-vite-"));
  await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({ name: "vite-app", devDependencies: { vite: "^5.0.0" } }));
  assert.equal(await isViteProject(tmpDir), true);

  const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), "qa-test-non-vite-"));
  await fs.writeFile(path.join(tmpDir2, "package.json"), JSON.stringify({ name: "plain-app" }));
  assert.equal(await isViteProject(tmpDir2), false);

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(tmpDir2, { recursive: true, force: true });
});

test("2 & 3. Available port selection finds a free port starting from 4173", async () => {
  const port1 = await findAvailablePort(4173);
  assert.ok(typeof port1 === "number" && port1 >= 4173);

  const port2 = await findAvailablePort(port1 + 1);
  assert.ok(port2 > port1);
});

test("4, 5, 11 & 12. Concrete routes filtering converts 4 React routes to browser audit targets and ignores source .tsx paths", () => {
  const discovered = ["/", "/contact", "/dashboard", "/products"];
  const browserOnly = concreteRoutes(discovered);
  assert.deepEqual(browserOnly, ["/", "/contact", "/dashboard", "/products"]);
  assert.equal(browserOnly.length, 4);

  const mixedWithSrc = ["/", "/contact", "src/App.tsx", "src/pages/Home.tsx"];
  const cleanBrowser = concreteRoutes(mixedWithSrc);
  assert.deepEqual(cleanBrowser, ["/", "/contact"]);
  assert.ok(!cleanBrowser.includes("src/App.tsx"));
});

test("13. SPA fallback HTTP 200 HTML does not validate missing API endpoint", () => {
  const mockResults: CheckResult[] = [
    {
      name: "Network Errors",
      status: "FAIL",
      duration: 10,
      data: {
        issues: [
          {
            route: "/api/profile",
            url: "http://127.0.0.1:4173/api/profile",
            type: "http-404",
            message: "API endpoint returned HTML page (SPA fallback 404)",
            status: 404,
          },
        ],
      },
    },
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].category, "Network");
  assert.equal(defects[0].canonicalTarget, "/api/profile");
});

test("17. Static and runtime missing image observations correlate correctly", () => {
  const mockResults: CheckResult[] = [
    {
      name: "Broken Images",
      status: "FAIL",
      duration: 10,
      data: {
        issues: [
          { route: "/", url: "/images/missing-logo.png", file: "src/App.tsx" },
        ],
      },
    },
    {
      name: "Network Errors",
      status: "FAIL",
      duration: 10,
      data: {
        issues: [
          { route: "/", url: "http://127.0.0.1:4173/images/missing-logo.png", type: "http-404", status: 404 },
        ],
      },
    },
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].category, "Images");
  assert.equal(defects[0].canonicalTarget, "/images/missing-logo.png");
  assert.equal(defects[0].observedBy.length, 2);
});

test("18. href='#' is not canonicalized as broken root route '/'", () => {
  const mockResults: CheckResult[] = [
    {
      name: "Broken Links",
      status: "WARNING",
      duration: 10,
      data: {
        issues: [
          {
            type: "suspicious-hash-link",
            file: "src/pages/Home.tsx",
            route: "src/pages/Home.tsx",
            url: "#",
            reason: "Suspicious hash anchor 'href=\"#\"'",
          },
        ],
      },
    },
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
  assert.notEqual(defects[0].canonicalTarget, "/");
  assert.ok(defects[0].canonicalTarget.includes("href=#"));
  assert.ok(defects[0].title.includes("Suspicious Hash Link"));
});

test("19 & 20. Server startup failure produces structured error and skips runtime checks cleanly without fake defects or false PASS", () => {
  const err = new ServerStartupError({
    code: "SERVER_PROCESS_EXITED",
    command: "npx vite preview",
    cwd: "/test",
    host: "127.0.0.1",
    requestedPort: 4173,
    exitCode: 1,
    stdout: "",
    stderr: "Error: dist folder does not exist",
    elapsedMs: 150,
  });

  assert.equal(err.diagnostics.code, "SERVER_PROCESS_EXITED");
  assert.equal(err.diagnostics.exitCode, 1);

  const mockResults: CheckResult[] = [
    { name: "Build", status: "PASS", duration: 10 },
    { name: "ESLint", status: "PASS", duration: 10 },
    { name: "TypeScript", status: "PASS", duration: 10 },
    { name: "Lighthouse", status: "SKIPPED", duration: 0, skipReason: err.message },
    { name: "Performance", status: "SKIPPED", duration: 0, skipReason: err.message },
    { name: "Console Errors", status: "SKIPPED", duration: 0, skipReason: err.message },
    { name: "Network Errors", status: "SKIPPED", duration: 0, skipReason: err.message },
  ];

  const coverage = calculateScanCoverage(mockResults);
  assert.equal(coverage.applicableScanners, 7);
  assert.equal(coverage.executedSuccessfully, 3);
  assert.equal(coverage.skipped, 4);
  assert.equal(coverage.coveragePercent, 43);

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 0, "Skipped runtime checks must NOT generate fake application defects");
});

test("21. Fully executable runtime scan reaches 100% coverage", () => {
  const mockResults: CheckResult[] = [
    { name: "Build", status: "PASS", duration: 10 },
    { name: "ESLint", status: "PASS", duration: 10 },
    { name: "TypeScript", status: "PASS", duration: 10 },
    { name: "Code Quality Insights", status: "WARNING", duration: 10 },
    { name: "Responsive", status: "PASS", duration: 10 },
    { name: "Accessibility", status: "FAIL", duration: 10 },
    { name: "Lighthouse Performance", status: "WARNING", duration: 10 },
    { name: "Performance", status: "PASS", duration: 10 },
    { name: "Broken Links", status: "FAIL", duration: 10 },
    { name: "Broken Images", status: "FAIL", duration: 10 },
    { name: "Console Errors", status: "FAIL", duration: 10 },
    { name: "Network Errors", status: "FAIL", duration: 10 },
  ];

  const coverage = calculateScanCoverage(mockResults);
  assert.equal(coverage.applicableScanners, 12);
  assert.equal(coverage.executedSuccessfully, 12);
  assert.equal(coverage.coveragePercent, 100);
});
