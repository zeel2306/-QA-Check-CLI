import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { BrokenImagesCheck } from "../checks/brokenImages.js";

test("BrokenImagesCheck detects missing image files statically", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-images-test-"));

  try {
    fs.mkdirSync(path.join(tmpDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "assets", "logo.png"), "fake image content");

    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      `<html>
        <body>
          <img src="assets/logo.png" alt="Logo" />
          <img src="assets/missing-banner.png" alt="Banner" />
        </body>
      </html>`
    );

    const check = new BrokenImagesCheck();
    const result = await check.run(tmpDir);

    assert.equal(result.status, "FAIL", "Should return FAIL when image asset is missing");
    const data = result.data as { issues: Array<{ url: string }> };
    assert.equal(data.issues.length, 1, "Should find 1 missing image asset");
    assert.equal(data.issues[0].url, "assets/missing-banner.png");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
