import { Router } from "express";
import { requireAuth } from "./auth.js";
import { requireRole } from "./authorization.js";
import type { Role } from "./generated/prisma/client.js";

export const dashboard = Router();
dashboard.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
dashboard.use(requireAuth);

const definitions: { path: string; role: Role; title: string; labels: string[] }[] = [
  { path: "admin", role: "ADMIN", title: "Admin Dashboard", labels: ["Platform overview", "Account overview", "Quality overview"] },
  { path: "developer", role: "DEVELOPER", title: "Developer Dashboard", labels: ["My Projects", "Recent Scans", "Assigned Issues"] },
  { path: "qa", role: "QA", title: "QA Engineer Dashboard", labels: ["Projects to Review", "Open Defects", "Pending Verification"] },
];
for (const definition of definitions) {
  dashboard.get(`/${definition.path}`, requireRole(definition.role), (_req, res) => {
    const { id, name, email, role } = res.locals.user;
    res.json({ user: { id, name, email, role }, title: definition.title, demo: true,
      cards: definition.labels.map(label => ({ label, value: "—", description: "Demo data · Not connected yet" })) });
  });
}
