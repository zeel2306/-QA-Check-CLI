import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import bcrypt from "bcryptjs";

test("project permissions, validation, lifecycle, search and pagination", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = randomBytes(48).toString("hex");
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.AUTH_RATE_LIMIT = "100";
  const { app } = await import("../src/app.js"); const { db } = await import("../src/db.js");
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const suffix = randomBytes(10).toString("hex"); const userIds: string[] = [];
  const cookies = {} as Record<"ADMIN" | "DEVELOPER" | "QA", string>;
  const request = (path: string, role?: keyof typeof cookies, method = "GET", body?: unknown, origin = "http://localhost:3000") => fetch(`${base}/projects${path}`, {
    method, headers: { Cookie: role ? cookies[role] : "", ...(method !== "GET" ? { Origin: origin, "Content-Type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    const password = "project-test-password-123"; const passwordHash = await bcrypt.hash(password, 12);
    for (const role of ["ADMIN", "DEVELOPER", "QA"] as const) {
      const email = `project-test-${role.toLowerCase()}-${suffix}@example.com`;
      const user = await db.user.create({ data: { name: `${role} Project Test`, email, passwordHash, role } }); userIds.push(user.id);
      const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      assert.equal(login.status, 200); cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
    }
    assert.equal((await request("")).status, 401);
    assert.equal((await request("", undefined, "POST", { name: "test" })).status, 401);
    assert.equal((await request("", "QA", "POST", { name: "test" })).status, 403);
    assert.equal((await request("", "ADMIN", "POST", { name: "  " })).status, 400);
    assert.equal((await request("", "ADMIN", "POST", { name: "x".repeat(101) })).status, 400);
    assert.equal((await request("", "ADMIN", "POST", { name: suffix, status: "ARCHIVED" })).status, 400);
    assert.equal((await request("", "ADMIN", "POST", { name: suffix, createdById: userIds[1] })).status, 400);
    for (const repositoryUrl of ["javascript:alert(1)", "ftp://example.com", "https://user:password@example.com"]) assert.equal((await request("", "DEVELOPER", "POST", { name: suffix, repositoryUrl })).status, 400);
    assert.equal((await request("", "ADMIN", "POST", { name: suffix }, "https://evil.example")).status, 403);
    const created = await request("", "ADMIN", "POST", { name: `  Project ${suffix} A  `, description: "Description", framework: "Next.js", repositoryUrl: "https://example.com/repo" });
    assert.equal(created.status, 201); const a = (await created.json()).project;
    assert.equal(a.name, `Project ${suffix} A`); assert.equal(a.status, "ACTIVE"); assert.deepEqual(a.createdBy, { name: "ADMIN Project Test" });
    for (const key of ["nameKey", "createdById", "passwordHash", "email"]) assert.equal(key in a, false);
    assert.equal((await request("", "DEVELOPER", "POST", { name: `project ${suffix} a` })).status, 409);
    const second = await request("", "DEVELOPER", "POST", { name: `Project ${suffix} B`, framework: "React" });
    assert.equal(second.status, 201); const b = (await second.json()).project;
    const third = await request("", "ADMIN", "POST", { name: `Project ${suffix} C` }); assert.equal(third.status, 201);
    for (const role of ["ADMIN", "DEVELOPER", "QA"] as const) assert.equal((await request(`/${a.id}`, role)).status, 200);
    assert.equal((await request(`/${a.id}`, "QA", "PATCH", { name: "Forbidden" })).status, 403);
    for (const role of ["ADMIN", "DEVELOPER"] as const) {
      const edited = await request(`/${a.id}`, role, "PATCH", { description: `${role} updated` }); assert.equal(edited.status, 200);
      const project = (await edited.json()).project; assert.equal(project.framework, "Next.js"); assert.equal(project.description, `${role} updated`);
    }
    const cleared = await request(`/${a.id}`, "DEVELOPER", "PATCH", { repositoryUrl: "", framework: null }); assert.equal(cleared.status, 200); const clearedProject = (await cleared.json()).project;
    assert.equal(clearedProject.repositoryUrl, null); assert.equal(clearedProject.framework, null); assert.equal(clearedProject.description, "DEVELOPER updated");
    assert.equal((await request(`/${a.id}`, "ADMIN", "PATCH", {})).status, 400);
    assert.equal((await request(`/${a.id}`, "ADMIN", "PATCH", { status: "ARCHIVED" })).status, 400);
    assert.equal((await request(`/${b.id}`, "ADMIN", "PATCH", { name: a.name })).status, 409);
    assert.equal((await request("/invalid", "QA")).status, 400);
    assert.equal((await request(`/${randomUUID()}`, "QA")).status, 404);
    assert.equal((await request(`/${randomUUID()}`, "ADMIN", "PATCH", { name: "Missing" })).status, 404);
    for (const query of ["?page=0", "?limit=51", "?page=abc", "?status=ALL", "?q=" + "x".repeat(101)]) assert.equal((await request(query, "QA")).status, 400);
    const page1 = await request(`?q=${suffix}&limit=2&page=1`, "QA"); assert.equal(page1.status, 200); const one = await page1.json();
    assert.equal(one.pagination.total, 3); assert.equal(one.pagination.totalPages, 2); assert.equal(one.projects.length, 2);
    const two = await (await request(`?q=${suffix}&limit=2&page=2`, "QA")).json(); assert.equal(two.projects.length, 1); assert(!one.projects.some((p: { id: string }) => p.id === two.projects[0].id));
    for (const role of ["DEVELOPER", "QA"] as const) for (const action of ["archive", "restore"]) assert.equal((await request(`/${a.id}/${action}`, role, "PATCH", {})).status, 403);
    assert.equal((await request(`/${a.id}/archive`, "ADMIN", "PATCH", { status: "ACTIVE" })).status, 400);
    assert.equal((await request(`/${a.id}/archive`, "ADMIN", "PATCH", {})).status, 200);
    const active = await (await request(`?q=${suffix}`, "QA")).json(); assert.equal(active.pagination.total, 2); assert(!active.projects.some((p: { id: string }) => p.id === a.id));
    for (const role of ["ADMIN", "DEVELOPER", "QA"] as const) assert.equal((await request(`/${a.id}`, role)).status, 404);
    for (const role of ["DEVELOPER", "QA"] as const) {
      assert.equal((await request("?status=ARCHIVED", role)).status, 403);
      assert.equal((await request(`/${a.id}?includeArchived=true`, role)).status, 403);
    }
    assert.equal((await request(`/${a.id}?includeArchived=true`, "ADMIN")).status, 200);
    const archived = await (await request(`?status=ARCHIVED&q=${suffix}`, "ADMIN")).json(); assert.equal(archived.pagination.total, 1); assert.equal(archived.projects[0].id, a.id);
    for (const role of ["ADMIN", "DEVELOPER"] as const) assert.equal((await request(`/${a.id}`, role, "PATCH", { name: "Archived edit" })).status, 409);
    assert.equal((await request(`/${a.id}/restore`, "ADMIN", "PATCH", {})).status, 200);
    assert.equal((await request(`/${a.id}`, "QA")).status, 200);
    assert.equal((await request(`/${a.id}`, "DEVELOPER", "PATCH", { description: "Restored edit" })).status, 200);
    assert.equal((await request(`/${randomUUID()}/archive`, "ADMIN", "PATCH", {})).status, 404);
  } finally {
    try { await db.project.deleteMany({ where: { createdById: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } }); }
    finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await db.$disconnect(); }
  }
});
