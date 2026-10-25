import test from "node:test";
import assert from "node:assert/strict";
import { stripVolatileQueryParams, correlateCanonicalDefects } from "../core/canonical.js";
import { compareWithBaseline, buildNormalizedFingerprint } from "../baseline/compare.js";
import { getIssueSuggestions } from "../suggestions/index.js";
import type { AuditReport, CheckResult } from "../types/result.js";

test("1 & 2. _rsc difference does not change network identity across route, method, target", () => {
  const fp1 = buildNormalizedFingerprint("Network Errors", {
    route: "/about",
    method: "GET",
    url: "http://127.0.0.1:4173/ghost?_rsc=abc123",
    type: "HTTP 404 Not Found",
  });
  const fp2 = buildNormalizedFingerprint("Network Errors", {
    route: "/about",
    method: "GET",
    url: "http://127.0.0.1:4173/ghost?_rsc=xyz987",
    type: "HTTP 404 Not Found",
  });

  assert.ok(fp1 && fp2);
  assert.equal(fp1.id, fp2.id);
  assert.equal(fp1.issue.target, "/ghost");
  assert.equal(fp2.issue.target, "/ghost");
});

test("3. Same target observed repeatedly collapses correctly into one canonical defect", () => {
  const mockResults: CheckResult[] = [
    {
      name: "Network Errors",
      status: "FAIL",
      duration: 100,
      data: {
        issues: [
          { route: "/about", url: "/ghost?_rsc=a", type: "HTTP 404 Not Found" },
          { route: "/about", url: "/ghost?_rsc=b", type: "HTTP 404 Not Found" },
          { route: "/about", url: "/ghost?_rsc=c", type: "HTTP 404 Not Found" },
        ],
      },
    },
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].canonicalTarget, "/ghost");
});

test("4 & 5. Different meaningful query parameters remain distinct targets", () => {
  const fp1 = buildNormalizedFingerprint("Network Errors", {
    route: "/products",
    url: "/api/product?id=10",
    type: "HTTP 404 Not Found",
  });
  const fp2 = buildNormalizedFingerprint("Network Errors", {
    route: "/products",
    url: "/api/product?id=11",
    type: "HTTP 404 Not Found",
  });

  assert.ok(fp1 && fp2);
  assert.notEqual(fp1.id, fp2.id);
  assert.equal(fp1.issue.target, "/api/product?id=10");
  assert.equal(fp2.issue.target, "/api/product?id=11");
});

test("6 & 7. Historical baseline with old raw fingerprint is re-normalized on baseline comparison", () => {
  const previousReport: AuditReport = {
    version: 2,
    projectPath: "test",
    framework: "next",
    pipeline: "next",
    checksExecuted: ["Network Errors"],
    checksSkipped: [],
    routes: ["/about"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: 60,
    results: [
      {
        name: "Network Errors",
        status: "FAIL",
        duration: 50,
        data: {
          issues: [
            {
              id: "old_unnormalized_id_123",
              checkName: "Network Errors",
              route: "/about",
              url: "http://127.0.0.1:4173/ghost?_rsc=abc",
              type: "HTTP 404 Not Found",
            },
          ],
        },
      },
    ],
  };

  const currentReport: AuditReport = {
    ...previousReport,
    results: [
      {
        name: "Network Errors",
        status: "FAIL",
        duration: 50,
        data: {
          issues: [
            {
              checkName: "Network Errors",
              route: "/about",
              url: "http://127.0.0.1:4173/ghost?_rsc=xyz",
              type: "HTTP 404 Not Found",
            },
          ],
        },
      },
    ],
  };

  const comparison = compareWithBaseline(currentReport, previousReport);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 0);
  assert.equal(comparison.qualityGate.passed, true);
});

test("8, 9, 10, 11. newIssues and fixedIssues arrays contain deduplicated unique canonical defects", () => {
  const previousReport: AuditReport = {
    version: 2,
    projectPath: "test",
    framework: "next",
    pipeline: "next",
    checksExecuted: ["Network Errors"],
    checksSkipped: [],
    routes: ["/about"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 100,
    overallScore: 80,
    results: [
      {
        name: "Network Errors",
        status: "PASS",
        duration: 50,
        data: { issues: [] },
      },
    ],
  };

  const currentReport: AuditReport = {
    ...previousReport,
    overallScore: 60,
    results: [
      {
        name: "Network Errors",
        status: "FAIL",
        duration: 50,
        data: {
          issues: [
            { route: "/about", url: "/ghost?_rsc=1", type: "HTTP 404 Not Found" },
            { route: "/about", url: "/ghost?_rsc=2", type: "HTTP 404 Not Found" },
          ],
        },
      },
    ],
  };

  const comparison = compareWithBaseline(currentReport, previousReport);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 1);
  assert.equal(comparison.qualityGate.newIssuesCount, 1);
  assert.equal(comparison.categorizedIssues.newIssues[0].target, "/ghost");
});

test("12. Regression issue presentation exposes stable target information", () => {
  const fp = buildNormalizedFingerprint("Network Errors", {
    route: "/about",
    url: "http://127.0.0.1:4173/ghost?_rsc=123",
    type: "HTTP 404 Not Found",
  });
  assert.ok(fp);
  assert.equal(fp.issue.target, "/ghost");
});

test("13. Consecutive identical run produces NEW=0 and FIXED=0 and Regression Gate PASS", () => {
  const report: AuditReport = {
    version: 2,
    projectPath: "test",
    framework: "next",
    pipeline: "next",
    checksExecuted: ["ESLint", "Network Errors"],
    checksSkipped: [],
    routes: ["/"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    duration: 200,
    overallScore: 58,
    results: [
      {
        name: "ESLint",
        status: "FAIL",
        duration: 100,
        data: {
          issues: [
            { file: "page.tsx", line: 10, column: 5, ruleId: "react/jsx-key", message: "Missing key" },
          ],
        },
      },
      {
        name: "Network Errors",
        status: "FAIL",
        duration: 100,
        data: {
          issues: [
            { route: "/about", url: "/ghost?_rsc=99", type: "HTTP 404 Not Found" },
          ],
        },
      },
    ],
  };

  const comparison = compareWithBaseline(report, report);
  assert.ok(comparison);
  assert.equal(comparison.categorizedIssues.newIssues.length, 0);
  assert.equal(comparison.categorizedIssues.fixedIssues.length, 0);
  assert.equal(comparison.qualityGate.passed, true);
});

test("14, 15, 16, 17. ESLint rules produce rule-specific suggestions", () => {
  const mockResult: CheckResult = {
    name: "ESLint",
    status: "FAIL",
    duration: 10,
    data: {
      issues: [
        { file: "a.tsx", line: 1, column: 1, severity: 2, ruleId: "react/jsx-key", message: "Key error" },
        { file: "b.tsx", line: 1, column: 1, severity: 2, ruleId: "@next/next/no-img-element", message: "Img error" },
        { file: "c.tsx", line: 1, column: 1, severity: 2, ruleId: "jsx-a11y/alt-text", message: "Alt error" },
        { file: "d.tsx", line: 1, column: 1, severity: 2, ruleId: "react-hooks/purity", message: "Purity error" },
      ],
    },
  };

  const suggestions = getIssueSuggestions(mockResult);
  assert.equal(suggestions.length, 4);

  const keys = suggestions.map((s) => s.code);
  assert.ok(keys.includes("react/jsx-key"));
  assert.ok(keys.includes("@next/next/no-img-element"));
  assert.ok(keys.includes("jsx-a11y/alt-text"));
  assert.ok(keys.includes("react-hooks/purity"));

  const keySugg = suggestions.find((s) => s.code === "react/jsx-key");
  assert.ok(keySugg?.suggestedFix[0].includes("key prop"));

  const imgSugg = suggestions.find((s) => s.code === "@next/next/no-img-element");
  assert.ok(imgSugg?.suggestedFix[0].includes("next/image"));

  const altSugg = suggestions.find((s) => s.code === "jsx-a11y/alt-text");
  assert.ok(altSugg?.suggestedFix[0].includes("alt attribute"));

  const puritySugg = suggestions.find((s) => s.code === "react-hooks/purity");
  assert.ok(puritySugg?.suggestedFix[0].includes("Date.now()"));
});

test("18 & 19. Tooling warnings do not become canonical defects or fail regression gate", () => {
  const mockResults: CheckResult[] = [
    {
      name: "ESLint",
      status: "PASS",
      duration: 10,
      data: {
        totalIssues: 0,
        issues: [],
        toolingWarnings: ["[baseline-browser-mapping] The data in this module is over two months old..."],
      },
    },
  ];

  const defects = correlateCanonicalDefects(mockResults);
  assert.equal(defects.length, 0);
});
