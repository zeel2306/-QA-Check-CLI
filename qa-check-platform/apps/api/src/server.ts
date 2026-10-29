import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
const port = config.PORT;

const server = app.listen(port, () => {
  console.log(`QA Check Platform API listening on http://localhost:${port}`);
});
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => { void db.$disconnect(); }));
}
