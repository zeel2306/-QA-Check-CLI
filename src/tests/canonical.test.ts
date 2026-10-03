import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateFindings, toCanonicalRoute } from "../core/canonical.js";

test("toCanonicalRoute normalizes index.html and / to /", () => {
  assert.equal(toCanonicalRoute("index.html"), "/");
  assert.equal(toCanonicalRoute("/index.html"), "/");
  assert.equal(toCanonicalRoute("/"), "/");
  assert.equal(toCanonicalRoute("http://localhost:4173/index.html"), "/");
});

test("toCanonicalRoute normalizes products.html and /products.html to /products.html", () => {
  assert.equal(toCanonicalRoute("products.html"), "/products.html");
  assert.equal(toCanonicalRoute("/products.html"), "/products.html");
  assert.equal(toCanonicalRoute("./products.html"), "/products.html");
  assert.equal(toCanonicalRoute("http://localhost:4173/products.html?v=1#sec"), "/products.html");
});

test("static + runtime same broken link => one issue with sources: ['static', 'runtime']", () => {
  const staticItems = [
    { route: "products.html", type: "broken-internal-link", url: "missing.html", reason: "Target missing" },
  ];
  const runtimeItems = [
    { route: "/products.html", type: "broken-internal-link", url: "missing.html", reason: "HTTP 404" },
  ];

  const getSig = (item: typeof staticItems[0], canonicalRoute: string) =>
    `${canonicalRoute}:${item.type}:${item.url}`;

  const merged = deduplicateFindings(staticItems, runtimeItems, getSig);

  assert.equal(merged.length, 1, "Should merge static and runtime findings into 1 issue");
  assert.equal(merged[0].route, "/products.html");
  assert.deepEqual(merged[0].sources, ["static", "runtime"]);
});

test("two genuinely different broken links => two issues", () => {
  const staticItems = [
    { route: "products.html", type: "broken-internal-link", url: "missing-1.html" },
    { route: "products.html", type: "broken-internal-link", url: "missing-2.html" },
  ];
  const runtimeItems: typeof staticItems = [];

  const getSig = (item: typeof staticItems[0], canonicalRoute: string) =>
    `${canonicalRoute}:${item.type}:${item.url}`;

  const merged = deduplicateFindings(staticItems, runtimeItems, getSig);

  assert.equal(merged.length, 2, "Different broken link targets should remain separate issues");
});

test("static + runtime same missing image => one issue", () => {
  const staticItems = [
    { route: "index.html", type: "missing-image-asset", url: "assets/logo.png" },
  ];
  const runtimeItems = [
    { route: "/", type: "missing-image-asset", url: "assets/logo.png" },
  ];

  const getSig = (item: typeof staticItems[0], canonicalRoute: string) =>
    `${canonicalRoute}:${item.type}:${item.url}`;

  const merged = deduplicateFindings(staticItems, runtimeItems, getSig);

  assert.equal(merged.length, 1, "Same missing image asset should merge into 1 issue");
  assert.equal(merged[0].route, "/");
  assert.deepEqual(merged[0].sources, ["static", "runtime"]);
});

test("same SEO missing-title found statically and at runtime => one issue", () => {
  const staticItems = [
    { route: "index.html", type: "missing-title", message: "Missing title" },
  ];
  const runtimeItems = [
    { route: "/", type: "missing-title", message: "Missing title" },
  ];

  const getSig = (item: typeof staticItems[0], canonicalRoute: string) =>
    `${canonicalRoute}:${item.type}`;

  const merged = deduplicateFindings(staticItems, runtimeItems, getSig);

  assert.equal(merged.length, 1, "Same SEO issue should merge into 1 issue");
  assert.equal(merged[0].route, "/");
  assert.deepEqual(merged[0].sources, ["static", "runtime"]);
});
