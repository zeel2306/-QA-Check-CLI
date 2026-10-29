import { parseArgs } from "node:util";
import { z } from "zod";
import { config } from "./config.js";
import { db } from "./db.js";

try {
  const { values } = parseArgs({ options: {
    email: { type: "string" }, role: { type: "string" }, "confirm-local-role-change": { type: "boolean", default: false },
  } });
  const input = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()),
    role: z.enum(["ADMIN", "DEVELOPER", "QA"]) }).safeParse(values);
  const host = new URL(config.DATABASE_URL).hostname;
  if (config.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error("Role assignment is restricted to development and a loopback database host.");
  }
  if (!input.success || !values["confirm-local-role-change"]) {
    throw new Error("Usage: npm run user:set-role -- --email user@example.com --role ADMIN|QA|DEVELOPER --confirm-local-role-change");
  }
  const user = await db.user.findUnique({ where: { email: input.data.email }, select: { id: true } });
  if (!user) throw new Error("User not found. Register the account first.");
  await db.user.update({ where: { id: user.id }, data: { role: input.data.role } });
  console.log(`Assigned ${input.data.role} to ${input.data.email}. Existing sessions use the current database role on their next request.`);
} catch (error) {
  // Only deliberate operational messages are printed; never database URLs/errors.
  const safe = error instanceof Error && (error.message.startsWith("Usage:") || error.message.startsWith("User not found") || error.message.startsWith("Role assignment"));
  console.error(safe ? (error as Error).message : "Role assignment failed. Check local database configuration and arguments.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
