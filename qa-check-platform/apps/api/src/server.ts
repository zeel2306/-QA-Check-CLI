import "dotenv/config";
import express from "express";

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const app = express();
app.disable("x-powered-by");
app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "qa-check-platform-api" });
});

const server = app.listen(port, () => {
  console.log(`QA Check Platform API listening on http://localhost:${port}`);
});
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close());
}
