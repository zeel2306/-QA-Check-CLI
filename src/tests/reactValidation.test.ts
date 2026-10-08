import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";
import { BrokenImagesCheck } from "../checks/brokenImages.js";
import { PerformanceCheck } from "../checks/performance.js";
import { NetworkCheck } from "../checks/network.js";
import { ConsoleErrorsCheck } from "../checks/consoleErrors.js";
import { CodeQualityInsightsCheck } from "../checks/codeQuality.js";

test("BrokenLinksCheck statically analyzes React/JSX files and declared routes", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-react-links-"));

  try {
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // App router / config declaring / and /about
    fs.writeFileSync(
      path.join(srcDir, "App.tsx"),
      `import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
       export function App() {
         return (
           <Routes>
             <Route path="/" element={<Home />} />
             <Route path="/about" element={<About />} />
           </Routes>
         );
       }`
    );

    // Component containing valid route link, broken link, hash link, and javascript:void(0)
    fs.writeFileSync(
      path.join(srcDir, "Nav.tsx"),
      `export function Nav() {
         return (
           <nav>
             <Link to="/about">About Us</Link>
             <NavLink to="/missing-route">Missing Route</NavLink>
             <a href="#">Hash Link</a>
             <a href="javascript:void(0)">JS Action</a>
           </nav>
         );
       }`
    );

    const check = new BrokenLinksCheck();
    const result = await check.run(tmpDir);

    assert.equal(result.status, "FAIL", "Should fail due to missing route link");
    assert.ok((result.pagesCompleted ?? 0) >= 2, "Should attempt scanned source files");

    const issues = (result.data as any).issues as Array<{ type: string; url: string }>;
    assert.ok(issues.some((i) => i.type === "broken-internal-link" && i.url === "/missing-route"), "Should catch broken /missing-route");
    assert.ok(issues.some((i) => i.type === "suspicious-hash-link"), "Should catch hash link");
    assert.ok(issues.some((i) => i.type === "javascript-link"), "Should catch javascript: link");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("BrokenImagesCheck statically resolves Vite public/ assets in React projects", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-react-img-"));

  try {
    const srcDir = path.join(tmpDir, "src");
    const publicAssetsDir = path.join(tmpDir, "public", "assets");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(publicAssetsDir, { recursive: true });

    // Real image file in public/assets/logo.png
    fs.writeFileSync(path.join(publicAssetsDir, "logo.png"), "dummy-png");

    fs.writeFileSync(
      path.join(srcDir, "Header.tsx"),
      `export function Header() {
         return (
           <div>
             <img src="/assets/logo.png" alt="Valid Logo" />
             <img src="/assets/missing-hero.jpg" alt="Missing Hero" />
           </div>
         );
       }`
    );

    const check = new BrokenImagesCheck();
    const result = await check.run(tmpDir);

    assert.equal(result.status, "FAIL", "Should fail due to missing image asset");
    const issues = (result.data as any).issues as Array<{ type: string; url: string }>;
    assert.equal(issues.length, 1, "Should only report missing image asset");
    assert.equal(issues[0].url, "/assets/missing-hero.jpg");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CodeQualityInsightsCheck detects React missing keys, no-alert, and unhandled fetch", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-react-codequality-"));

  try {
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, "UserList.tsx"),
      `export function UserList({ users }) {
         const showAlert = () => {
           alert("Hello world");
         };

         const loadData = () => {
           fetch("/api/users");
         };

         return (
           <div>
             {users.map((u) => (
               <div>{u.name}</div>
             ))}
           </div>
         );
       }`
    );

    const check = new CodeQualityInsightsCheck();
    const result = await check.run(tmpDir);

    const issues = result.data?.issues ?? [];
    assert.ok(issues.some((i) => i.type === "no-alert"), "Should detect alert() usage");
    assert.ok(issues.some((i) => i.type === "react-missing-list-key"), "Should detect missing key in map()");
    assert.ok(issues.some((i) => i.type === "unhandled-fetch-error"), "Should detect unhandled fetch()");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Browser checks return NOT_APPLICABLE when zero pages/data were collected", async () => {
  const emptyProvider = async () => null as any;

  const perfCheck = new PerformanceCheck(emptyProvider);
  const perfResult = await perfCheck.run("/fake");
  assert.equal(perfResult.status, "NOT_APPLICABLE");
  assert.equal(perfResult.pagesCompleted, 0);

  const netCheck = new NetworkCheck(emptyProvider);
  const netResult = await netCheck.run("/fake");
  assert.equal(netResult.status, "NOT_APPLICABLE");

  const consoleCheck = new ConsoleErrorsCheck(emptyProvider);
  const consoleResult = await consoleCheck.run("/fake");
  assert.equal(consoleResult.status, "NOT_APPLICABLE");
});
