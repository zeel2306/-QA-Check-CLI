import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { matchesDeclaredRoute, extractDeclaredRoutes } from "../utils/routes.js";
import { discoverRoutes, discoverDeclaredApplicationRoutes } from "../crawler.js";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";

const cases: Array<[string, string, boolean]> = [
  ["/profile/:id", "/profile/42", true],
  ["/profile/:id", "/profile/123", true],
  ["/profile/:id", "/profile/zeel", true],
  ["/users/:id", "/users/123", true],
  ["/products/:productId", "/products/widget", true],
  ["/blog/:slug", "/blog/hello-world", true],
  ["/teams/:teamId/members/:memberId", "/teams/1/members/2", true],
  ["/profile/:id", "/profile/42?tab=activity", true],
  ["/profile/:id", "/profile/42#details", true],
  ["/profile/:id", "http://localhost:4173/profile/42?tab=activity#details", true],
  ["/profile/:id", "/profile", false],
  ["/profile/:id", "/profile/42/edit", false],
  ["/profile/:id", "/other/42", false],
  ["/profile/:id", "/ghost", false],
  ["/profile/:id?", "/profile", true],
  ["/profile/:id?", "/profile/42/edit", false],
  ["/docs/:parts+", "/docs/a/b", true],
  ["/docs/:parts+", "/docs", false],
  ["/docs/:parts*", "/docs", true],
  ["/docs/:parts*", "/docs/a/b", true],
  ["/users/:id(\\d+)", "/users/42", true],
  ["/users/:id(\\d+)", "/users/zeel", false],
  ["/files/:pathMatch(.*)*", "/files/a/b", true],
  ["/profile/[id]", "/profile/42", true],
  ["/profile/[id]", "/profile", false],
  ["/docs/[...parts]", "/docs/a/b", true],
  ["/docs/[...parts]", "/docs", false],
  ["/docs/[[...parts]]", "/docs", true],
  ["/docs/[[...parts]]", "/docs/a/b", true],
  ["/files/*", "/files/a/b", true],
  ["/files/*", "/ghost", false],
];
for (const [declared, concrete, expected] of cases) {
  test(`${declared} ${expected ? "matches" : "does not match"} ${concrete}`, () => {
    assert.equal(matchesDeclaredRoute(concrete, declared), expected);
  });
}

test("shared route extraction keeps optional and catch-all declarations, excluding destinations", () => {
  assert.deepEqual(extractDeclaredRoutes(`const routes = [{path: '/users/:id?'}, {path: '/docs/:parts*'}];
    <Route path="/blog/:slug" /><RouterLink to="/ghost" />`),
  ["/users/:id?", "/docs/:parts*", "/blog/:slug"]);
});

test("Broken Links validates dynamic declarations in HTML and Vue without validating unknown destinations", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "qa-route-matching-"));
  try {
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { vue: "3.0.0", vite: "1.0.0" } }));
    await fs.writeFile(path.join(root, "src", "router.ts"), `export const routes = [
      {path: '/profile/:id'}, {path: '/users/:id'}, {path: '/teams/:teamId/members/:memberId'}];`);
    const valid = ["/profile/42", "/profile/123", "/profile/zeel", "/users/123", "/teams/1/members/2", "/profile/42?tab=activity", "/profile/42#details"];
    const invalid = ["/profile", "/profile/42/edit", "/other/42", "/ghost"];
    await fs.writeFile(path.join(root, "index.html"), [...valid, ...invalid, "#"].map((url) => `<a href="${url}">link</a>`).join("\n"));
    await fs.writeFile(path.join(root, "src", "App.vue"), `<template>${[...valid, ...invalid, "#"].map((url) => `<RouterLink to="${url}">link</RouterLink>`).join("\n")}</template>`);
    const discovered = await discoverRoutes(root);
    const declared = await discoverDeclaredApplicationRoutes(root);
    assert.ok(discovered.routes.includes("/profile/:id"));
    assert.ok(discovered.routes.includes("/profile/42"));
    assert.ok(!discovered.routes.some((route) => route.includes("?tab=") || route.includes("#details")));
    assert.ok(discovered.routes.includes("/ghost")); // A crawl candidate must never prove validity.
    assert.ok(!declared.includes("/ghost"));
    const result = await new BrokenLinksCheck().run(root);
    const issues = (result.data as {issues: Array<{url: string; type: string}>}).issues;
    assert.equal(result.status, "FAIL");
    for (const url of valid) assert.ok(!issues.some((issue) => issue.url === url), `${url} must be valid`);
    for (const url of invalid) assert.ok(issues.some((issue) => issue.url === url && issue.type === "broken-internal-link"), `${url} must remain broken`);
    assert.ok(issues.some((issue) => issue.url === "#" && issue.type === "suspicious-hash-link"));
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test("file-based route declarations are shared with Broken Links", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "qa-next-route-matching-"));
  try {
    await fs.mkdir(path.join(root, "app", "profile", "[id]"), {recursive: true});
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({dependencies: {next: "15.0.0"}}));
    await fs.writeFile(path.join(root, "index.html"), "<html><body>Home</body></html>");
    await fs.writeFile(path.join(root, "app", "profile", "[id]", "page.tsx"), `export default function Page() { return <a href="/profile/42">valid</a>; }`);
    const declared = await discoverDeclaredApplicationRoutes(root);
    assert.ok(declared.includes("/profile/[id]"));
    const result = await new BrokenLinksCheck().run(root);
    assert.equal(result.status, "PASS");
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});
