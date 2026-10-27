import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in apps/api/.env first.");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});
try {
  await client.connect();
  await client.query("SELECT 1");
  console.log("PostgreSQL connection verified (SELECT 1 succeeded).");
} catch (error) {
  console.error("PostgreSQL connection could not be verified:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
} finally {
  await client.end();
}
