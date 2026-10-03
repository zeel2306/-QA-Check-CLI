import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";

test("BrokenLinksCheck detects broken relative links, warnings, and SKIPPED states", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-links-test-"));

  try {
    // Case 1: Empty folder -> SKIPPED
    const check = new BrokenLinksCheck();
    const resultEmpty = await check.run(tmpDir);
    assert.equal(resultEmpty.status, "SKIPPED", "Empty folder should result in SKIPPED status");

    // Case 2: Folder with valid link + broken link + suspicious hash
    fs.writeFileSync(path.join(tmpDir, "target.html"), "<html><body>Target</body></html>");
    fs.writeFileSync(
      path.join(tmpDir, "index.html"),
      `<html>
        <body>
          <a href="target.html">Valid Link</a>
          <a href="missing.html">Broken Link</a>
          <a href="#">Suspicious Hash Anchor</a>
          <a href="javascript:void(0)">JS Link</a>
        </body>
      </html>`
    );

    const resultWithIssues = await check.run(tmpDir);
    assert.equal(resultWithIssues.status, "FAIL", "Should return FAIL when broken link is present");
    assert.equal(resultWithIssues.pagesCompleted, 2, "Should attempt 2 html files");

    const data = resultWithIssues.data as { issues: Array<{ url: string; type: string }> };
    assert.equal(data.issues.length, 3, "Should find 3 total link issues (1 broken, 2 warnings)");
    const brokenItems = data.issues.filter((i) => i.type === "broken-internal-link");
    assert.equal(brokenItems.length, 1, "Should find 1 broken link");
    assert.equal(brokenItems[0].url, "missing.html");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
