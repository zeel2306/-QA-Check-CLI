import test from "node:test";
import assert from "node:assert/strict";
import { getIssueSuggestions } from "../suggestions/index.js";
import type { CheckResult } from "../types/result.js";

test("Broken Links never receives missing-alt suggestion", () => {
  const brokenLinksResult: CheckResult = {
    name: "Broken Links",
    status: "FAIL",
    duration: 100,
    data: {
      broken: [{ route: "/index.html", url: "missing.html", reason: "Target missing" }],
    },
  };

  const suggestions = getIssueSuggestions(brokenLinksResult);
  const codes = suggestions.map((s) => s.code);

  assert.ok(!codes.includes("missing-alt"), "Broken Links must never receive missing-alt suggestion");
  assert.ok(codes.includes("broken-internal-link") || codes.includes("broken-link"), "Should map to link suggestion");
});

test("Broken Images missing asset never becomes image-alt", () => {
  const brokenImagesResult: CheckResult = {
    name: "Broken Images",
    status: "FAIL",
    duration: 100,
    data: {
      missingAssets: [{ route: "/index.html", url: "logo.png", reason: "File missing" }],
    },
  };

  const suggestions = getIssueSuggestions(brokenImagesResult);
  const codes = suggestions.map((s) => s.code);

  assert.ok(!codes.includes("missing-alt"), "Broken Images missing asset must never become image-alt");
  assert.ok(codes.includes("missing-image-asset") || codes.includes("broken-image"), "Should map to asset suggestion");
});

test("Accessibility image-alt remains independent", () => {
  const a11yResult: CheckResult = {
    name: "Accessibility",
    status: "FAIL",
    duration: 100,
    data: {
      issues: [{ route: "/", type: "image-alt", message: "Images must have alt text" }],
    },
  };

  const suggestions = getIssueSuggestions(a11yResult);
  const codes = suggestions.map((s) => s.code);

  assert.ok(codes.includes("image-alt") || codes.includes("missing-alt"), "Accessibility image-alt should map to alt suggestion");
  assert.equal(suggestions[0].title, "Image Missing Alt Text");
});
