import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { auth } from "./auth.js";
import { dashboard } from "./dashboard.js";
import { projects } from "./projects.js";

export const app = express();
app.disable("x-powered-by");
// Keep Express's default trust proxy=false. Configure a trusted proxy explicitly
// before deploying behind one; never trust arbitrary X-Forwarded-For headers.
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "OPTIONS"] }));
app.use("/api/v1/auth", (req, res, next) => {
  // JSON-only mutations plus an exact origin check protect cookie sessions from CSRF.
  if (req.method === "POST" && (req.get("Origin") !== config.FRONTEND_ORIGIN || !req.is("application/json"))) {
    res.status(403).json({ error: "Request origin or content type is not allowed." }); return;
  }
  next();
});
app.use(express.json({ limit: "8kb" }));
app.use(cookieParser());
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "qa-check-platform-api" }));
app.use("/api/v1/auth", auth);
app.use("/api/v1/dashboard", dashboard);
app.use("/api/v1/projects", projects);
app.use((_req, res) => { res.status(404).json({ error: "Not found." }); });
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error?.status === "number" && [400, 413].includes(error.status) ? error.status : 500;
  res.status(status).json({ error: status === 500 ? "Something went wrong. Please try again." : "Invalid request body." });
};
app.use(errorHandler);
