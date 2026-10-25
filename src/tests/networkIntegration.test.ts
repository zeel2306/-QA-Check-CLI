import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { runBrowserAudit } from "../core/browser.js";
import { NetworkCheck } from "../checks/network.js";

test("Network Errors captures failed fetch (HTTP 404), requestfailed, and deduplicates identical failures", async () => {
  let server: http.Server;
  let port = 0;

  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!doctype html>
          <html>
            <head><title>Test App</title></head>
            <body>
              <h1>App Loaded</h1>
              <script>
                // Immediate async fetch
                fetch('/api/does-not-exist');

                // Delayed async fetch after load
                setTimeout(() => {
                  fetch('/api/does-not-exist'); // Duplicate call
                  fetch('/api/another-failed-route');
                }, 200);
              </script>
            </body>
          </html>
        `);
      } else if (req.url === "/api/another-failed-route") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      port = addr.port;
      resolve();
    });
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const auditProvider = async () => runBrowserAudit(baseUrl, ["/"], "./reports");

    const check = new NetworkCheck(auditProvider);
    const result = await check.run("/fake");

    assert.equal(result.status, "FAIL", "Network check must fail when failing fetch calls occur");

    const issues = (result.data as any).issues as Array<{ type: string; url: string; route: string }>;
    assert.ok(issues.length >= 2, "Should capture failing network requests");

    const doesNotExistIssues = issues.filter((i) => i.url.includes("/api/does-not-exist"));
    assert.equal(doesNotExistIssues.length, 1, "Duplicate /api/does-not-exist failures must be deduplicated to 1 issue");

    const anotherIssue = issues.find((i) => i.url.includes("/api/another-failed-route"));
    assert.ok(anotherIssue, "Should capture HTTP 500 error on /api/another-failed-route");
    assert.equal(anotherIssue.type, "http-500");
  } finally {
    await new Promise<void>((res) => server.close(() => res()));
  }
});
