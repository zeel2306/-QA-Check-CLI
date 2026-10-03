import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { discoverRoutes } from "../crawler.js";

test("discoverRoutes discovers HTML pages in an HTML project", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-crawler-test-"));

  try {
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html><body>Index</body></html>");
    fs.writeFileSync(path.join(tmpDir, "about.html"), "<html><body>About</body></html>");
    fs.mkdirSync(path.join(tmpDir, "blog"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "blog", "post.html"), "<html><body>Post</body></html>");

    const { framework, routes } = await discoverRoutes(tmpDir);

    assert.equal(framework, "HTML", "Framework should be detected as HTML");
    assert.deepEqual(
      routes,
      ["/", "/about.html", "/blog/post.html"],
      "Routes should include /, /about.html, /blog/post.html sorted alphabetically"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
