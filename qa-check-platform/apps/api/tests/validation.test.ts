import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

test("origin protection, input validation, cookies, CORS and rate limiting without a database", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:5432/unused";
  process.env.SESSION_SECRET = "test-only-secret-with-at-least-32-characters";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.AUTH_RATE_LIMIT = "3";
  const { app } = await import("../src/app.js");
  const { db } = await import("../src/db.js");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1/auth`;
  const post = (body: unknown, origin = "http://localhost:3000") => fetch(`${base}/register`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post({}, "https://evil.example")).status, 403);
    assert.equal((await fetch(`${base}/logout`, { method: "POST" })).status, 403);
    const invalid = await post({ name: "", email: "invalid", password: "short" });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(invalid.headers.get("access-control-allow-credentials"), "true");
    assert.equal((await post({ name: "Test", email: "test@example.com", password: "😀".repeat(20) })).status, 400);
    assert.equal((await post({ name: "Test", email: "test@example.com", password: "short" })).status, 400);
    assert.equal((await post({})).status, 429);
    const anonymous = await fetch(`${base}/me`);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/me`, { headers: { Cookie: "qa_session=invalid" } })).status, 401);
    const logout = await fetch(`${base}/logout`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie")!, /HttpOnly/i);
    assert.match(logout.headers.get("set-cookie")!, /SameSite=Lax/i);
    const malformed = await fetch(`${base}/login`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: "{" });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "Invalid request body." });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.$disconnect();
  }
});
