import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

test("role defaults, exact-role access matrix and live session role changes", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(48).toString("hex");
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.AUTH_RATE_LIMIT = "100";
  const { app } = await import("../src/app.js");
  const { db } = await import("../src/db.js");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const roles = ["ADMIN", "DEVELOPER", "QA"] as const;
  const emails: string[] = [];
  const post = (path: string, body: unknown, cookie = "") => fetch(`${base}/auth/${path}`, {
    method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
  });
  const get = (path: string, cookie = "") => fetch(`${base}/${path}`, { headers: { Cookie: cookie, "X-Role": "ADMIN" } });
  try {
    for (const role of roles) assert.equal((await get(`dashboard/${role.toLowerCase()}`)).status, 401);
    for (const role of roles) {
      const email = `role-test-${randomBytes(12).toString("hex")}@example.com`;
      emails.push(email);
      const credentials = { email, password: "role-test-password-123" };
      // Any role field is rejected, including DEVELOPER; it is always server assigned.
      const forged = await post("register", { ...credentials, name: "Test User", role });
      assert.equal(forged.status, 400);
      assert.equal(await db.user.count({ where: { email } }), 0);
      const registered = await post("register", { ...credentials, name: `${role} Test` });
      assert.equal(registered.status, 201);
      const registration = await registered.json();
      assert.equal(registration.user.role, "DEVELOPER");
      assert.equal("passwordHash" in registration.user, false);
      await db.user.update({ where: { email }, data: { role } });
      const login = await post("login", credentials);
      assert.equal(login.status, 200);
      assert.equal((await login.json()).user.role, role);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const me = await get("auth/me", cookie);
      assert.equal(me.status, 200);
      assert.equal((await me.json()).user.role, role);
      for (const target of roles) {
        const result = await get(`dashboard/${target.toLowerCase()}`, cookie);
        assert.equal(result.status, target === role ? 200 : 403, `${role} -> ${target}`);
        if (result.ok) {
          const data = await result.json();
          assert.equal(data.user.role, role);
          assert.equal(data.demo, true);
          assert.equal(data.cards.length, 3);
          assert.equal("passwordHash" in data.user, false);
          assert.equal(result.headers.get("cache-control"), "no-store");
        }
      }
      // Authorization reads the database each time, even for an existing cookie.
      const changedRole = role === "QA" ? "DEVELOPER" : "QA";
      await db.user.update({ where: { email }, data: { role: changedRole } });
      assert.equal((await get(`dashboard/${role.toLowerCase()}`, cookie)).status, 403);
      assert.equal((await get(`dashboard/${changedRole.toLowerCase()}`, cookie)).status, 200);
      assert.equal((await post("logout", {}, cookie)).status, 204);
      assert.equal((await get(`dashboard/${changedRole.toLowerCase()}`, cookie)).status, 401);
    }
  } finally {
    try { await db.user.deleteMany({ where: { email: { in: emails } } }); }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.$disconnect();
    }
  }
});
