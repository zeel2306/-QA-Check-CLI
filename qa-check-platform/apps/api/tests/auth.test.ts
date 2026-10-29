import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

test("authentication lifecycle against PostgreSQL", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(48).toString("hex");
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.AUTH_RATE_LIMIT = "30";
  const { app } = await import("../src/app.js");
  const { db } = await import("../src/db.js");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1/auth`;
  const email = `auth-test-${randomBytes(12).toString("hex")}@example.com`;
  const credentials = { email, password: "test-password-12345" };
  const post = (path: string, body: unknown, cookie = "", origin = "http://localhost:3000") => fetch(`${base}/${path}`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
  });
  const me = (cookie = "") => fetch(`${base}/me`, { headers: { Cookie: cookie } });
  let userCreated = false;
  try {
    assert.equal((await me()).status, 401);
    assert.equal((await post("register", { ...credentials, name: "Test User" }, "", "https://evil.example")).status, 403);
    assert.equal((await post("register", { name: "", email: "invalid", password: "short" })).status, 400);
    const registered = await post("register", { ...credentials, email: email.toUpperCase(), name: " Test User " });
    assert.equal(registered.status, 201);
    userCreated = true;
    const payload = await registered.json();
    assert.equal(payload.user.name, "Test User");
    assert.equal(payload.user.email, email);
    assert.equal(payload.user.role, "DEVELOPER");
    assert.equal("passwordHash" in payload.user, false);
    const stored = await db.user.findUniqueOrThrow({ where: { email } });
    assert.notEqual(stored.passwordHash, credentials.password);
    assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
    assert.equal((await post("register", { ...credentials, name: "Duplicate" })).status, 409);
    assert.equal((await post("login", { ...credentials, password: "wrong-password" })).status, 401);
    const login = await post("login", credentials);
    assert.equal(login.status, 200);
    assert.equal("passwordHash" in (await login.json()).user, false);
    const setCookie = login.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const cookie = setCookie.split(";")[0];
    const session = await me(cookie);
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.name, "Test User");
    assert.equal((await me("qa_session=invalid")).status, 401);
    const second = await post("login", credentials, cookie);
    const secondCookie = second.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await me(cookie)).status, 401, "login rotates the current session");
    assert.equal((await post("logout", {}, secondCookie)).status, 204);
    assert.equal((await me(secondCookie)).status, 401, "logout revokes the database session");
    const third = await post("login", credentials);
    const expiredCookie = third.headers.get("set-cookie")!.split(";")[0];
    await db.session.updateMany({ where: { userId: stored.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await me(expiredCookie)).status, 401);
    let limited = false;
    for (let i = 0; i < 31; i++) {
      if ((await post("login", { email: "bad", password: "" })).status === 429) { limited = true; break; }
    }
    assert(limited, "authentication endpoints are rate limited");
  } finally {
    try { if (userCreated) await db.user.deleteMany({ where: { email } }); }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.$disconnect();
    }
  }
});
