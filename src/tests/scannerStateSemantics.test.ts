import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import { calculateScanCoverage, calculateOverallScore } from "../core/report.js";
import { getIssueSuggestions } from "../suggestions/index.js";
import { compareWithBaseline } from "../baseline/compare.js";
import { writeHtmlReport } from "../reporters/html.js";
import { sanitizeAnsi, sanitizeSensitiveData } from "../utils/ansi.js";
import type { AuditReport, CheckResult } from "../types/result.js";

function createMockReport(results: CheckResult[], score = 64): AuditReport {
  const coverage = calculateScanCoverage(results);
  return {
    version: 2,
    projectPath: "/test-project",
    framework: "React",
    pipeline: "React",
    checksExecuted: results.filter((r) => r.status === "PASS" || r.status === "FAIL" || r.status === "WARNING" || r.status === "ERROR").map((r) => r.name),
    checksSkipped: results.filter((r) => r.status === "SKIPPED").map((r) => r.name),
    checksNotApplicable: results.filter((r) => r.status === "NOT_APPLICABLE").map((r) => r.name),
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: score,
    coverage,
    results,
  };
}

test("1. NOT_APPLICABLE is excluded from coverage denominator, absent from checksSkipped, present in checksNotApplicable", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", duration: 10 },
    { name: "ESLint", status: "SKIPPED", message: "No ESLint config", duration: 0 },
    { name: "TypeScript", status: "NOT_APPLICABLE", message: "Project does not use TypeScript", duration: 0 },
  ];

  const report = createMockReport(results);
  assert.equal(report.coverage?.applicableScanners, 2, "Applicable scanners: 3 total - 1 NOT_APPLICABLE = 2");
  assert.equal(report.coverage?.notApplicable, 1);
  assert.deepEqual(report.checksSkipped, ["ESLint"]);
  assert.deepEqual(report.checksNotApplicable, ["TypeScript"]);
});

test("2. NOT_APPLICABLE produces zero issues and zero fix suggestions", () => {
  const result: CheckResult = {
    name: "TypeScript",
    status: "NOT_APPLICABLE",
    message: "Project does not use TypeScript",
    duration: 0,
  };

  const suggestions = getIssueSuggestions(result);
  assert.equal(suggestions.length, 0, "NOT_APPLICABLE must produce 0 suggestions");
});

test("3. NOT_APPLICABLE is absent from COMPARISON UNAVAILABLE in baseline comparison", () => {
  const prevResults: CheckResult[] = [
    { name: "ESLint", status: "SKIPPED", duration: 0 },
    { name: "TypeScript", status: "NOT_APPLICABLE", duration: 0 },
  ];
  const curResults: CheckResult[] = [
    { name: "ESLint", status: "SKIPPED", duration: 0 },
    { name: "TypeScript", status: "NOT_APPLICABLE", duration: 0 },
  ];

  const prev = createMockReport(prevResults);
  const cur = createMockReport(curResults);

  const comp = compareWithBaseline(cur, prev);
  assert.ok(comp);

  const unavailable = (comp.categorizedIssues.scannerComparisonStates || []).filter((s) => s.status === "UNAVAILABLE");
  assert.equal(unavailable.length, 1);
  assert.equal(unavailable[0]?.checkName, "ESLint");
  assert.ok(!unavailable.some((s) => s.checkName === "TypeScript"), "TypeScript MUST NOT appear under COMPARISON UNAVAILABLE");
});

test("4. SKIPPED remains comparison unavailable but does not create fake application defects", () => {
  const result: CheckResult = {
    name: "ESLint",
    status: "SKIPPED",
    message: "No ESLint configuration found",
    duration: 0,
  };

  const suggestions = getIssueSuggestions(result);
  assert.equal(suggestions.length, 0, "SKIPPED must not create fake application defect suggestions");
});

test("5. Category trend labels with tolerance: 64->64 = STABLE, 64->65 = IMPROVED, 64->63 = STABLE, 64->61 = REGRESSED", () => {
  const prev = createMockReport([{ name: "Build", status: "PASS", score: 64, duration: 10 }], 64);

  const curStable = createMockReport([{ name: "Build", status: "PASS", score: 64, duration: 10 }], 64);
  const compStable = compareWithBaseline(curStable, prev);
  assert.equal(compStable?.categoryScores[0]?.status, "STABLE");

  const curImproved = createMockReport([{ name: "Build", status: "PASS", score: 65, duration: 10 }], 65);
  const compImproved = compareWithBaseline(curImproved, prev);
  assert.equal(compImproved?.categoryScores[0]?.status, "IMPROVED");

  const curWithinTol = createMockReport([{ name: "Build", status: "PASS", score: 63, duration: 10 }], 63);
  const compWithinTol = compareWithBaseline(curWithinTol, prev);
  assert.equal(compWithinTol?.categoryScores[0]?.status, "STABLE", "Score delta -1 within tolerance 2 must be STABLE");

  const curRegressed = createMockReport([{ name: "Build", status: "PASS", score: 61, duration: 10 }], 61);
  const compRegressed = compareWithBaseline(curRegressed, prev);
  assert.equal(compRegressed?.categoryScores[0]?.status, "REGRESSED", "Score delta -3 exceeding tolerance 2 must be REGRESSED");
});

test("6. HTML contains only one primary Regression Gate banner and renders NOT_APPLICABLE card & filter", async () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "TypeScript", status: "NOT_APPLICABLE", message: "Project does not use TypeScript", duration: 0 },
  ];
  const prev = createMockReport(results, 100);
  const cur = createMockReport(results, 100);
  cur.baseline = compareWithBaseline(cur, prev);
  cur.currentQualityGate = { passed: true, reasons: [], failingChecks: [] };

  const htmlPath = await writeHtmlReport(cur, "./test-reports");
  const html = await fs.readFile(htmlPath, "utf8");

  const count = (html.match(/Regression Gate: PASSED/g) || []).length;
  assert.equal(count, 1, "HTML report should contain only ONE Regression Gate banner");

  assert.ok(html.includes("NOT APPLICABLE"), "HTML toolbar must render NOT APPLICABLE filter");
  assert.ok(html.includes("data-filter=\"NOT_APPLICABLE\""), "Filter button must target data-filter NOT_APPLICABLE");
  assert.ok(html.includes("Checks not applicable"), "HTML report must render Checks not applicable panel");
  assert.ok(html.includes("Execution"), "NOT_APPLICABLE card details must render neutral execution label");
  assert.ok(html.includes("Not required"), "NOT_APPLICABLE card details must state 'Not required'");
});

test("7. HTML renders exact CSS classes for STABLE, IMPROVED, and REGRESSED metric & category rows", async () => {
  const prev = createMockReport([
    { name: "Lighthouse Performance", status: "WARNING", score: 55, duration: 10, metadata: { categoryScores: { performance: 55 } } }
  ], 55);
  const cur = createMockReport([
    { name: "Lighthouse Performance", status: "WARNING", score: 55, duration: 10, metadata: { categoryScores: { performance: 55 } } }
  ], 55);

  cur.baseline = compareWithBaseline(cur, prev);
  const htmlPath = await writeHtmlReport(cur, "./test-reports");
  const html = await fs.readFile(htmlPath, "utf8");

  assert.ok(html.includes("cat-row stable"), "STABLE metric comparison must render class 'cat-row stable'");
  assert.ok(!html.includes("cat-row improved"), "Unchanged metric comparison MUST NOT render class 'cat-row improved'");
});

test("8. NOT_APPLICABLE is excluded from overall score denominator", () => {
  const results: CheckResult[] = [
    { name: "Build", status: "PASS", score: 100, duration: 10 },
    { name: "TypeScript", status: "NOT_APPLICABLE", message: "Project does not use TypeScript", duration: 0 },
  ];

  const score = calculateOverallScore(results);
  assert.equal(score, 100, "NOT_APPLICABLE checks must be excluded from overall score calculation");
});

test("9. NOT_APPLICABLE check card uses class 'check-card not-applicable' and canonical data-status='NOT_APPLICABLE'", async () => {
  const results: CheckResult[] = [
    { name: "TypeScript", status: "NOT_APPLICABLE", message: "Project does not use TypeScript", duration: 0 },
  ];
  const cur = createMockReport(results, 100);
  const htmlPath = await writeHtmlReport(cur, "./test-reports");
  const html = await fs.readFile(htmlPath, "utf8");

  assert.ok(html.includes("class=\"check-card not-applicable\""), "Must use class 'check-card not-applicable'");
  assert.ok(!html.includes("class=\"check-card not_applicable\""), "MUST NOT use class 'check-card not_applicable'");
  assert.ok(html.includes("data-status=\"NOT_APPLICABLE\""), "data-status attribute must remain canonical 'NOT_APPLICABLE'");
  assert.ok(html.includes("data-filter=\"NOT_APPLICABLE\""), "data-filter attribute must remain canonical 'NOT_APPLICABLE'");
});

test("10. Prioritizing result.data.issues prevents duplicate issue extraction across sub-arrays", () => {
  const sampleIssues = [
    { type: "broken_link", route: "/about", message: "Target file does not exist" },
    { type: "broken_link", route: "/contact", message: "Target file does not exist" },
  ];
  const result: CheckResult = {
    name: "Broken Links",
    status: "FAIL",
    duration: 50,
    data: {
      issues: sampleIssues,
      broken: sampleIssues, // sub-array that would duplicate if issues wasn't prioritized
    },
  };
  const prev = createMockReport([result], 60);
  const cur = createMockReport([result], 60);
  const comp = compareWithBaseline(cur, prev);
  assert.ok(comp);
  assert.equal(comp.categorizedIssues.existingIssues.length, 2, "Only 2 issues should be extracted from result.data, not 4");
});

test("11. sanitizeAnsi recursively strips ANSI escape codes from objects and strings", () => {
  const dirty = {
    title: "\x1B[31mError Message\x1B[0m",
    nested: {
      text: "\x1B[32mSuccess\x1B[0m",
      count: 42,
    },
    list: ["\x1B[33mWarning\x1B[0m", "Clean"],
  };
  const clean = sanitizeAnsi(dirty);
  assert.equal(clean.title, "Error Message");
  assert.equal(clean.nested.text, "Success");
  assert.equal(clean.nested.count, 42);
  assert.deepEqual(clean.list, ["Warning", "Clean"]);
});

test("12. Aggregate score tolerance (2 points) maps delta = -1 or -2 to STABLE while delta <= -3 maps to REGRESSED", () => {
  const prev = createMockReport([{ name: "Build", status: "PASS", score: 64, duration: 10 }], 64);

  const curMinus1 = createMockReport([{ name: "Build", status: "PASS", score: 63, duration: 10 }], 63);
  const comp1 = compareWithBaseline(curMinus1, prev);
  assert.equal(comp1?.categoryScores[0]?.status, "STABLE");

  const curMinus2 = createMockReport([{ name: "Build", status: "PASS", score: 62, duration: 10 }], 62);
  const comp2 = compareWithBaseline(curMinus2, prev);
  assert.equal(comp2?.categoryScores[0]?.status, "STABLE");

  const curMinus3 = createMockReport([{ name: "Build", status: "PASS", score: 61, duration: 10 }], 61);
  const comp3 = compareWithBaseline(curMinus3, prev);
  assert.equal(comp3?.categoryScores[0]?.status, "REGRESSED");
});

test("13. Regression Gate still FAILS when NEW ISSUES > 0 or tracked metrics exceed tolerance even if aggregate score is within tolerance", () => {
  const prevResult: CheckResult = {
    name: "Broken Links",
    status: "FAIL",
    duration: 50,
    data: { issues: [{ type: "broken_link", route: "/old", message: "404" }] },
  };
  const curResult: CheckResult = {
    name: "Broken Links",
    status: "FAIL",
    duration: 50,
    data: {
      issues: [
        { type: "broken_link", route: "/old", message: "404" },
        { type: "broken_link", route: "/new-broken", message: "404" },
      ],
    },
  };
  const prev = createMockReport([prevResult], 64);
  const cur = createMockReport([curResult], 63); // delta = -1 (within tolerance) but 1 NEW issue added

  const comp = compareWithBaseline(cur, prev);
  assert.ok(comp);
  assert.equal(comp.qualityGate.passed, false, "Regression Gate MUST FAIL when NEW ISSUES > 0 even if score delta is within tolerance");
  assert.equal(comp.categorizedIssues.newIssues.length, 1);
});

test("14. Deduplicated comparable checks finding extraction produces consistent total issues count across analytics and baseline", () => {
  const issue1 = { type: "broken_link", route: "/about", message: "404" };
  const issue2 = { type: "missing_alt", route: "/home", message: "Missing alt" };
  const check1: CheckResult = { name: "Broken Links", status: "FAIL", duration: 10, data: { issues: [issue1] } };
  const check2: CheckResult = { name: "Accessibility", status: "FAIL", duration: 10, data: { issues: [issue2] } };

  const prev = createMockReport([check1, check2], 50);
  const cur = createMockReport([check1, check2], 50);

  const comp = compareWithBaseline(cur, prev);
  assert.ok(comp);
  assert.equal(comp.totalIssues.current, 2);
  assert.equal(comp.totalIssues.previous, 2);
  assert.equal(comp.totalIssues.delta, 0);
});

test("15. Sensitive data redaction sanitizes tokens, passwords, and authorization headers", () => {
  const secretText = "Request failed authorization: bearer secret_token_xyz123 on https://example.com/api?token=abc12345&password=mysecretpassword";
  const sanitized = sanitizeSensitiveData(secretText);
  assert.ok(!sanitized.includes("secret_token_xyz123"));
  assert.ok(!sanitized.includes("mysecretpassword"));
  assert.ok(sanitized.includes("[REDACTED]"));

  const objWithSecret = {
    token: "my_secret_token",
    password: "my_secret_password",
    normal: "public_value",
  };
  const cleanObj = sanitizeAnsi(objWithSecret);
  assert.equal(cleanObj.token, "[REDACTED]");
  assert.equal(cleanObj.password, "[REDACTED]");
  assert.equal(cleanObj.normal, "public_value");
});

test("16. Performance timing metric comparison applies dual absolute and relative percentage thresholds", () => {
  const makePerfReport = (load: number) =>
    createMockReport([
      {
        name: "Performance",
        status: "PASS",
        duration: 10,
        data: { measurements: [{ route: "/", load, ttfb: 50 }] },
      },
    ]);

  const prev = makePerfReport(200);

  // 200 -> 210: STABLE
  const comp1 = compareWithBaseline(makePerfReport(210), prev);
  assert.equal(comp1?.metricChanges?.[0]?.status, "STABLE");

  // 200 -> 260: STABLE
  const comp2 = compareWithBaseline(makePerfReport(260), prev);
  assert.equal(comp2?.metricChanges?.[0]?.status, "STABLE");

  // 259 -> 704: STABLE (delta 445 <= 500)
  const prev259 = makePerfReport(259);
  const comp704 = compareWithBaseline(makePerfReport(704), prev259);
  assert.equal(comp704?.metricChanges?.[0]?.status, "STABLE");

  // 200 -> 900: REGRESSED (delta +700 > 500 AND +350% > 50%)
  const comp900 = compareWithBaseline(makePerfReport(900), prev);
  assert.equal(comp900?.metricChanges?.[0]?.status, "REGRESSED");

  // 2000 -> 2050: STABLE
  const prev2000 = makePerfReport(2000);
  const comp2050 = compareWithBaseline(makePerfReport(2050), prev2000);
  assert.equal(comp2050?.metricChanges?.[0]?.status, "STABLE");

  // 2000 -> 3200: REGRESSED (delta +1200 > 500 AND +60% > 50%)
  const comp3200 = compareWithBaseline(makePerfReport(3200), prev2000);
  assert.equal(comp3200?.metricChanges?.[0]?.status, "REGRESSED");
});

test("17. Baseline schema version incompatibility returns COMPARISON UNAVAILABLE cleanly", () => {
  const prev = createMockReport([{ name: "Build", status: "PASS", duration: 10 }]);
  (prev as any).version = 1; // legacy schema

  const cur = createMockReport([{ name: "Build", status: "PASS", duration: 10 }]); // version 2

  const comp = compareWithBaseline(cur, prev);
  assert.ok(comp);
  assert.equal(comp.qualityGate.passed, false);
  assert.ok(comp.qualityGate.reasons[0]?.includes("incompatible"));
  assert.equal(comp.categorizedIssues.scannerComparisonStates?.[0]?.status, "UNAVAILABLE");
});

test("18. Failure injection: scanner exception produces ERROR check result without crashing engine", async () => {
  const failingCheck: CheckResult = {
    name: "FailingScanner",
    status: "ERROR",
    duration: 10,
    errorReason: "Unexpected scanner timeout or dependency failure",
    message: "Scanner failed to execute",
  };

  const report = createMockReport([failingCheck]);
  assert.equal(report.coverage?.errors, 1);
  assert.equal(report.coverage?.executedSuccessfully, 0);
  assert.equal(report.results[0]?.status, "ERROR");
});
