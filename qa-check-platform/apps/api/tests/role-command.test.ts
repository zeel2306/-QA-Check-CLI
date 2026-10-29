import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
test("local role assignment requires confirmation, development and a loopback database", async () => {
  const script = fileURLToPath(new URL("../src/set-user-role.ts", import.meta.url));
  const env = { ...process.env, NODE_ENV: "development", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:5432/unused",
    FRONTEND_ORIGIN: "http://localhost:3000", SESSION_SECRET: "test-only-role-command-secret-with-32-characters" };
  const cases = [
    { env, args: ["--email", "test@example.com", "--role", "ADMIN"], message: "Usage:" },
    { env: { ...env, NODE_ENV: "production", FRONTEND_ORIGIN: "https://example.com" }, args: ["--email", "test@example.com", "--role", "ADMIN", "--confirm-local-role-change"], message: "restricted to development" },
    { env: { ...env, DATABASE_URL: "postgresql://unused:unused@database.example.com:5432/unused" }, args: ["--email", "test@example.com", "--role", "QA", "--confirm-local-role-change"], message: "loopback database" },
  ];
  for (const item of cases) {
    await assert.rejects(run(process.execPath, ["--import", "tsx", script, ...item.args], { env: item.env, timeout: 60000 }),
      (error: unknown) => {
        const failure = error as { code: number; stderr: string };
        assert.equal(failure.code, 1);
        assert(failure.stderr.includes(item.message));
        assert.equal(failure.stderr.includes("postgresql://"), false);
        return true;
      });
  }
});
