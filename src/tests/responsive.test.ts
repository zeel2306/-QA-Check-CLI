import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { ResponsiveCheck } from "../checks/responsive.js";

test("ResponsiveCheck static check detects missing viewport meta tag", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-responsive-test-"));

  try {
    // Case 1: Empty folder -> SKIPPED
    const check = new ResponsiveCheck();
    const resultEmpty = await check.run(tmpDir);
    assert.equal(resultEmpty.status, "SKIPPED", "Zero pages audited MUST return SKIPPED");

    // Case 2: Missing viewport tag -> FAIL
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html><head><title>Test</title></head><body>Hello</body></html>");
    const resultMissingViewport = await check.run(tmpDir);
    assert.equal(resultMissingViewport.status, "FAIL", "Missing viewport meta tag must return FAIL");

    // Case 3: Valid viewport meta tag -> PASS
    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Test</title></head><body>Hello</body></html>'
    );
    const resultValid = await check.run(tmpDir);
    assert.equal(resultValid.status, "PASS", "Valid viewport meta tag must return PASS");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
