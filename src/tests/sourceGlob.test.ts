import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sourceGlob from "../utils/sourceGlob.js";
import nativeFs from "node:fs";

async function fixture(t: TestContext, files: string[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "qa source glob "));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), "fixture");
  }
  return root;
}

test("source discovery preserves brace patterns and dynamic route filenames", async t => {
  const cwd = await fixture(t, ["src/App.tsx", "src/main.ts", "src/View.vue", "src/theme.css", "app/users/[id]/page.tsx", "app/api/[[...path]]/route.ts"]);
  assert.deepEqual((await sourceGlob(["src/**/*.{js,jsx,ts,tsx,vue}", "app/**/*.{js,jsx,ts,tsx,vue}"], { cwd })).sort(),
    ["app/api/[[...path]]/route.ts", "app/users/[id]/page.tsx", "src/App.tsx", "src/View.vue", "src/main.ts"]);
});

test("source discovery prunes generated trees and excludes dotfiles by default", async t => {
  const cwd = await fixture(t, ["index.html", "nested/page.html", ".private/page.html", "node_modules/pkg/index.html", "dist/index.html"]);
  assert.deepEqual((await sourceGlob("**/*.html", { cwd, ignore: ["**/node_modules/**", "**/dist/**"] })).sort(), ["index.html", "nested/page.html"]);
});

test("build snapshot discovery includes dotfiles without traversing ignored trees", async t => {
  const cwd = await fixture(t, [".env.example", ".config/settings.json", ".git/HEAD", "node_modules/pkg/a.js", "index.html"]);
  assert.deepEqual((await sourceGlob("**/*", { cwd, dot: true, onlyFiles: true, followSymbolicLinks: false, ignore: ["**/.git/**", "**/node_modules/**"] })).sort(),
    [".config/settings.json", ".env.example", "index.html"]);
});

test("overlapping discovery patterns return unique files and literal directories stay file-only", async t => {
  const cwd = await fixture(t, ["src/main.ts", "src/App.tsx"]);
  assert.deepEqual((await sourceGlob(["src/**/*.ts", "src/**/*.{ts,tsx}"], { cwd, unique: true })).sort(), ["src/App.tsx", "src/main.ts"]);
  assert.deepEqual(await sourceGlob("src", { cwd }), []);
});

test("discovery follows directory links normally but build snapshots do not", async t => {
  const cwd = await fixture(t, ["src/main.ts"]);
  await fs.symlink(path.join(cwd, "src"), path.join(cwd, "linked src"), process.platform === "win32" ? "junction" : "dir");
  assert.deepEqual((await sourceGlob("**/*.ts", { cwd })).sort(), ["linked src/main.ts", "src/main.ts"]);
  assert.deepEqual(await sourceGlob("**/*.ts", { cwd, followSymbolicLinks: false }), ["src/main.ts"]);
});

test("discovery handles spaced Unicode working directories and Laravel compound extensions", async t => {
  const root = await fixture(t, ["é nested site/resources/views/home.blade.php", "é nested site/public/page.html", "é nested site/src/组件.ts"]);
  const cwd = path.join(root, "é nested site");
  assert.deepEqual((await sourceGlob(["resources/views/**/*.blade.php", "public/**/*.html"], { cwd })).sort(), ["public/page.html", "resources/views/home.blade.php"]);
  assert.deepEqual(await sourceGlob("src/**/*.ts", { cwd }), ["src/组件.ts"]);
});

test("unreadable source discovery rejects instead of returning incomplete success", async t => {
  const cwd = await fixture(t, ["index.html"]);
  const denied = Object.assign(new Error("Source access denied"), { code: "EACCES" });
  const readdir = ((...args: unknown[]) => {
    const callback = args.at(-1) as (error: NodeJS.ErrnoException) => void;
    queueMicrotask(() => callback(denied));
  }) as typeof nativeFs.readdir;
  await assert.rejects(sourceGlob("**/*.html", { cwd, fs: { readdir } }), error => error === denied);
});

test("missing paths remain empty discoveries rather than filesystem failures", async t => {
  const cwd = await fixture(t, ["index.html"]);
  assert.deepEqual(await sourceGlob("**/*.html", { cwd: path.join(cwd, "missing") }), []);
});
