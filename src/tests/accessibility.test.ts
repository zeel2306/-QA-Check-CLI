import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { AccessibilityCheck } from "../checks/accessibility.js";

test("AccessibilityCheck static checks detect missing lang, missing alt, missing label, and icon-only button", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-a11y-test-"));

  try {
    // Case 1: Empty folder -> SKIPPED (never PASS)
    const check = new AccessibilityCheck();
    const resultEmpty = await check.run(tmpDir);
    assert.equal(resultEmpty.status, "SKIPPED", "Zero pages audited MUST return SKIPPED");

    // Case 2: HTML file with accessibility defects
    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      `<html>
        <body>
          <img src="logo.png" />
          <input type="text" id="username" />
          <button><i class="icon-search"></i></button>
        </body>
      </html>`
    );

    const resultDefects = await check.run(tmpDir);
    assert.notEqual(resultDefects.status, "PASS", "HTML with a11y defects must not report PASS");
    const data = resultDefects.data as { totalIssues: number; issues: Array<{ type: string }> };
    assert.ok(data.totalIssues >= 3, "Should detect lang, alt, label, or button issue");
    
    const types = data.issues.map((i) => i.type);
    assert.ok(types.includes("html-has-lang"), "Should detect missing html lang");
    assert.ok(types.includes("image-alt"), "Should detect missing img alt");
    assert.ok(types.includes("label"), "Should detect missing input label");
    assert.ok(types.includes("button-name"), "Should detect icon-only button without label");

    // Case 3: Fully accessible HTML -> PASS
    fs.writeFileSync(
      path.join(tmpDir, "clean.html"),
      `<html lang="en">
        <body>
          <img src="logo.png" alt="Company Logo" />
          <label for="search">Search</label>
          <input type="text" id="search" />
          <button>Search Now</button>
        </body>
      </html>`
    );

    const cleanTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-a11y-clean-"));
    try {
      fs.writeFileSync(
        path.join(cleanTmpDir, "clean.html"),
        `<html lang="en">
          <body>
            <img src="logo.png" alt="Company Logo" />
            <label for="search">Search</label>
            <input type="text" id="search" />
            <button>Search Now</button>
          </body>
        </html>`
      );
      const cleanResult = await check.run(cleanTmpDir);
      assert.equal(cleanResult.status, "PASS", "Valid accessible HTML should return PASS");
      assert.equal(cleanResult.score, 100, "Clean HTML score should be 100");
    } finally {
      fs.rmSync(cleanTmpDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
