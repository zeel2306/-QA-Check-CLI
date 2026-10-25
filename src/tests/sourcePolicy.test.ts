import test from "node:test";
import assert from "node:assert/strict";
import { isProjectSourceFile, isExcludedDir, DEFAULT_EXCLUDED_DIRECTORIES } from "../utils/sourcePolicy.js";

test("1. isExcludedDir recognizes generated and build directories", () => {
  assert.equal(isExcludedDir(".angular"), true);
  assert.equal(isExcludedDir("node_modules"), true);
  assert.equal(isExcludedDir("dist"), true);
  assert.equal(isExcludedDir("build"), true);
  assert.equal(isExcludedDir(".next"), true);
  assert.equal(isExcludedDir(".cache"), true);
  assert.equal(isExcludedDir("reports"), true);
  assert.equal(isExcludedDir("src"), false);
  assert.equal(isExcludedDir("app"), false);
  assert.equal(isExcludedDir("components"), false);
});

test("2. isProjectSourceFile excludes Angular cache and vendor files", () => {
  assert.equal(isProjectSourceFile(".angular/cache/20.3.38/vite/deps/@angular_core.js"), false);
  assert.equal(isProjectSourceFile("node_modules/react/index.js"), false);
  assert.equal(isProjectSourceFile("dist/bundle.js"), false);
  assert.equal(isProjectSourceFile("build/static/js/main.js"), false);
  assert.equal(isProjectSourceFile(".next/server/pages/index.js"), false);
  assert.equal(isProjectSourceFile("reports/report.json"), false);
});

test("3. isProjectSourceFile includes legitimate application source files", () => {
  assert.equal(isProjectSourceFile("src/app/app.component.ts"), true);
  assert.equal(isProjectSourceFile("src/app/pages/home.component.ts"), true);
  assert.equal(isProjectSourceFile("app/page.tsx"), true);
  assert.equal(isProjectSourceFile("pages/index.vue"), true);
  assert.equal(isProjectSourceFile("projects/my-app/src/app/app.component.ts"), true);
});

test("4. Excluded directories list is comprehensive and neutral", () => {
  assert.ok(DEFAULT_EXCLUDED_DIRECTORIES.includes("node_modules"));
  assert.ok(DEFAULT_EXCLUDED_DIRECTORIES.includes(".angular"));
  assert.ok(DEFAULT_EXCLUDED_DIRECTORIES.includes("dist"));
  assert.ok(DEFAULT_EXCLUDED_DIRECTORIES.includes("build"));
  assert.ok(DEFAULT_EXCLUDED_DIRECTORIES.includes("coverage"));
});
