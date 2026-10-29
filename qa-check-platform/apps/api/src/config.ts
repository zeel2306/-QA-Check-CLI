import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).max(15).default(12),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Report names only: validation errors can otherwise disclose input values.
  throw new Error(`Invalid authentication configuration: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
}
export const config = parsed.data;
if (new URL(config.FRONTEND_ORIGIN).origin !== config.FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN must be an origin without a trailing slash or path.");
}
if (config.NODE_ENV === "production" && !config.FRONTEND_ORIGIN.startsWith("https://")) {
  throw new Error("Production FRONTEND_ORIGIN must use HTTPS.");
}
