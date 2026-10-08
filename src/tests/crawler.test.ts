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

test("discoverRoutes discovers Nuxt file-based pages and Nitro API routes", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-check-nuxt-crawler-test-"));

  try {
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ dependencies: { nuxt: "^3.0.0" } }));
    fs.writeFileSync(path.join(tmpDir, "nuxt.config.ts"), "export default defineNuxtConfig({})");
    
    fs.mkdirSync(path.join(tmpDir, "pages", "products"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "pages", "index.vue"), "<template>Home</template>");
    fs.writeFileSync(path.join(tmpDir, "pages", "contact.vue"), "<template>Contact</template>");
    fs.writeFileSync(path.join(tmpDir, "pages", "products", "[id].vue"), "<template>Product</template>");

    fs.mkdirSync(path.join(tmpDir, "server", "api"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "server", "api", "health.get.ts"), "export default defineEventHandler(() => 'OK')");
    fs.writeFileSync(path.join(tmpDir, "server", "api", "users.get.ts"), "export default defineEventHandler(() => [])");

    const { framework, routes } = await discoverRoutes(tmpDir);

    assert.equal(framework, "Nuxt", "Framework should be detected as Nuxt");
    assert.deepEqual(
      routes,
      ["/", "/api/health", "/api/users", "/contact", "/products/[id]"],
      "Routes should include page routes and Nitro API endpoints sorted alphabetically"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
