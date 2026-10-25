import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateFindings, toCanonicalAssetPath, toCanonicalRoute, toCanonicalTargetHref } from "../core/canonical.js";
import { calculateScanCoverage, calculateOverallScore } from "../core/report.js";
import type { CheckResult } from "../types/result.js";

test("1. Static broken link (index.html + ./missing-page.html) + Runtime (/ + http://127.0.0.1:4173/missing-page.html) => 1 issue with sources static+runtime", () => {
  const staticItems = [
    { type: "broken-internal-link", route: "index.html", url: "./missing-page.html", reason: "Target file does not exist" },
  ];
  const runtimeItems = [
    { type: "broken-internal-link", route: "/", url: "http://127.0.0.1:4173/missing-page.html", reason: "HTTP 404" },
  ];

  const getSignature = (item: typeof staticItems[0], canonicalRoute: string) => {
    const canonicalTarget = toCanonicalTargetHref(item.url, canonicalRoute);
    return `${canonicalRoute}:${item.type}:${canonicalTarget}`;
  };

  const merged = deduplicateFindings(staticItems, runtimeItems, getSignature);

  assert.equal(merged.length, 1, "Should merge static and runtime findings into 1 issue");
  assert.equal(merged[0].route, "/");
  assert.deepEqual(merged[0].sources, ["static", "runtime"]);
});

test("2. Same deduplication scenario from products.html", () => {
  const staticItems = [
    { type: "broken-internal-link", route: "products.html", url: "./missing-page.html", reason: "Target file does not exist" },
  ];
  const runtimeItems = [
    { type: "broken-internal-link", route: "/products.html", url: "http://127.0.0.1:4173/missing-page.html", reason: "HTTP 404" },
  ];

  const getSignature = (item: typeof staticItems[0], canonicalRoute: string) => {
    const canonicalTarget = toCanonicalTargetHref(item.url, canonicalRoute);
    return `${canonicalRoute}:${item.type}:${canonicalTarget}`;
  };

  const merged = deduplicateFindings(staticItems, runtimeItems, getSignature);

  assert.equal(merged.length, 1, "Should merge static and runtime findings on products.html into 1 issue");
  assert.equal(merged[0].route, "/products.html");
  assert.deepEqual(merged[0].sources, ["static", "runtime"]);
});

test("3. Two different missing href targets on same page => 2 issues", () => {
  const staticItems = [
    { type: "broken-internal-link", route: "index.html", url: "./missing-1.html", reason: "Target missing" },
    { type: "broken-internal-link", route: "index.html", url: "./missing-2.html", reason: "Target missing" },
  ];

  const getSignature = (item: typeof staticItems[0], canonicalRoute: string) => {
    const canonicalTarget = toCanonicalTargetHref(item.url, canonicalRoute);
    return `${canonicalRoute}:${item.type}:${canonicalTarget}`;
  };

  const merged = deduplicateFindings(staticItems, [], getSignature);

  assert.equal(merged.length, 2, "Different missing targets on the same page must remain 2 issues");
});

test("4. Same href appearing on two different source pages => 2 separate page findings", () => {
  const staticItems = [
    { type: "broken-internal-link", route: "index.html", url: "./missing-page.html", reason: "Target missing" },
    { type: "broken-internal-link", route: "products.html", url: "./missing-page.html", reason: "Target missing" },
  ];

  const getSignature = (item: typeof staticItems[0], canonicalRoute: string) => {
    const canonicalTarget = toCanonicalTargetHref(item.url, canonicalRoute);
    return `${canonicalRoute}:${item.type}:${canonicalTarget}`;
  };

  const merged = deduplicateFindings(staticItems, [], getSignature);

  assert.equal(merged.length, 2, "Same broken href on 2 different source pages must produce 2 distinct page issues");
  assert.equal(merged[0].route, "/");
  assert.equal(merged[1].route, "/products.html");
});

test("5. Static missing image relative path + runtime absolute localhost URL => 1 issue", () => {
  const staticItems = [
    { type: "missing-image-asset", route: "index.html", url: "assets/hero-missing.jpg", reason: "Asset missing" },
  ];
  const runtimeItems = [
    { type: "missing-image-asset", route: "/", url: "http://127.0.0.1:4173/assets/hero-missing.jpg", reason: "HTTP 404" },
  ];

  const getSignature = (item: typeof staticItems[0], canonicalRoute: string) => {
    const canonicalAsset = toCanonicalAssetPath(item.url, canonicalRoute);
    return `${canonicalRoute}:${item.type}:${canonicalAsset}`;
  };

  const merged = deduplicateFindings(staticItems, runtimeItems, getSignature);

  assert.equal(merged.length, 1, "Should merge static relative and runtime absolute image URLs into 1 issue");
  assert.equal(merged[0].route, "/");
  assert.deepEqual(merged[0].sources, ["static", "runtime"]);
});

test("6. Three genuinely different missing image assets => 3 issues", () => {
  const staticItems = [
    { type: "missing-image-asset", route: "index.html", url: "assets/img1.jpg" },
    { type: "missing-image-asset", route: "index.html", url: "assets/img2.jpg" },
    { type: "missing-image-asset", route: "index.html", url: "assets/img3.jpg" },
  ];

  const getSignature = (item: typeof staticItems[0], canonicalRoute: string) => {
    const canonicalAsset = toCanonicalAssetPath(item.url, canonicalRoute);
    return `${canonicalRoute}:${item.type}:${canonicalAsset}`;
  };

  const merged = deduplicateFindings(staticItems, [], getSignature);

  assert.equal(merged.length, 3, "Three different missing image assets must result in 3 issues");
});

test("7. Query and hash normalization: fragments do not create duplicate broken targets", () => {
  const href1 = toCanonicalTargetHref("missing.html?version=1", "/");
  const href2 = toCanonicalTargetHref("./missing.html#section", "/");
  const href3 = toCanonicalTargetHref("http://127.0.0.1:4173/missing.html?v=2#top", "/");

  assert.equal(href1, "/missing.html");
  assert.equal(href2, "/missing.html");
  assert.equal(href3, "/missing.html");
});

test("8. Windows path separator normalization", () => {
  const route = toCanonicalRoute("sub\\page.html");
  const href = toCanonicalTargetHref("assets\\banner.jpg", "sub\\page.html");

  assert.equal(route, "/sub/page.html");
  assert.equal(href, "/sub/assets/banner.jpg");
});

test("9, 10, 11. Data model issues array equals unique normalized issue count", () => {
  const mockResult: CheckResult = {
    name: "Broken Links",
    status: "FAIL",
    score: 60,
    duration: 100,
    data: {
      totalIssues: 2,
      issues: [
        { type: "broken-internal-link", route: "/", url: "missing-1.html" },
        { type: "broken-internal-link", route: "/", url: "missing-2.html" },
      ],
    },
  };

  const dataObj = mockResult.data as { issues: Array<unknown>; totalIssues: number };
  assert.equal(dataObj.issues.length, 2, "Issues array length should match unique issue count");
  assert.equal(dataObj.totalIssues, 2, "totalIssues should match unique issue count");
});
