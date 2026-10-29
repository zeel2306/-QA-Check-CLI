import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";
import { requireRole } from "./authorization.js";
import { config } from "./config.js";
import type { Prisma } from "./generated/prisma/client.js";

export const projects = Router();
projects.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
projects.use(requireAuth);
projects.use((req, res, next) => {
  if (["POST", "PATCH"].includes(req.method) && (req.get("Origin") !== config.FRONTEND_ORIGIN || !req.is("application/json"))) {
    res.status(403).json({ error: "Request origin or content type is not allowed." }); return;
  }
  next();
});
const text = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value || null);
const repositoryUrl = text(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Enter a valid HTTP or HTTPS URL without embedded credentials.");
const fields = z.object({ name: z.string().trim().min(1, "Project name is required.").max(100),
  description: text(4000), framework: text(100), repositoryUrl }).strict();
const updateFields = fields.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field.");
const pagination = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12), q: z.string().trim().max(100).default(""),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE") }).strict();
const publicProject = { id: true, name: true, description: true, framework: true, repositoryUrl: true,
  status: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } } } as const;
const validId: RequestHandler = (req, res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) { res.status(400).json({ error: "Invalid project ID." }); return; }
  next();
};
function isCode(error: unknown, code: string) { return typeof error === "object" && error !== null && "code" in error && error.code === code; }

projects.get("/", async (req, res) => {
  const input = pagination.safeParse(req.query);
  if (!input.success) { res.status(400).json({ error: "Invalid search or pagination parameters." }); return; }
  const { page, limit, q, status } = input.data;
  if (status === "ARCHIVED" && res.locals.user.role !== "ADMIN") { res.status(403).json({ error: "Only admins can view archived projects." }); return; }
  const where: Prisma.ProjectWhereInput = { status, ...(q ? { OR: [
    { name: { contains: q, mode: "insensitive" } }, { framework: { contains: q, mode: "insensitive" } },
  ] } : {}) };
  const [total, items] = await db.$transaction([
    db.project.count({ where }), db.project.findMany({ where, select: publicProject,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
  ], { isolationLevel: "RepeatableRead" });
  res.json({ projects: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

projects.post("/", requireRole("ADMIN", "DEVELOPER"), async (req, res) => {
  const input = fields.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Check the project fields.", fieldErrors: input.error.flatten().fieldErrors }); return; }
  try {
    const project = await db.project.create({ data: { ...input.data, nameKey: input.data.name.toLowerCase(), createdById: res.locals.user.id }, select: publicProject });
    res.status(201).location(`/api/v1/projects/${project.id}`).json({ project });
  } catch (error) {
    if (isCode(error, "P2002")) { res.status(409).json({ error: "A project with this name already exists.", fieldErrors: { name: ["Choose a unique project name."] } }); return; }
    throw error;
  }
});

projects.get("/:id", validId, async (req, res) => {
  const query = z.object({ includeArchived: z.enum(["true", "false"]).default("false") }).strict().safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid project query." }); return; }
  const includeArchived = query.data.includeArchived === "true";
  if (includeArchived && res.locals.user.role !== "ADMIN") { res.status(403).json({ error: "Only admins can view archived projects." }); return; }
  const project = await db.project.findFirst({ where: { id: req.params.id as string, ...(includeArchived ? {} : { status: "ACTIVE" }) }, select: publicProject });
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }
  res.json({ project });
});

projects.patch("/:id", requireRole("ADMIN", "DEVELOPER"), validId, async (req, res) => {
  const input = updateFields.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Check the project fields.", fieldErrors: input.error.flatten().fieldErrors }); return; }
  const id = req.params.id as string;
  try {
    const project = await db.$transaction(async tx => {
      const changed = await tx.project.updateMany({ where: { id, status: "ACTIVE" }, data: { ...input.data,
        ...(input.data.name !== undefined ? { nameKey: input.data.name.toLowerCase() } : {}) } });
      return changed.count ? tx.project.findUnique({ where: { id }, select: publicProject }) : null;
    });
    if (!project) {
      const exists = await db.project.findUnique({ where: { id }, select: { id: true } });
      res.status(exists ? 409 : 404).json({ error: exists ? "Restore the archived project before editing." : "Project not found." }); return;
    }
    res.json({ project });
  } catch (error) {
    if (isCode(error, "P2002")) { res.status(409).json({ error: "A project with this name already exists.", fieldErrors: { name: ["Choose a unique project name."] } }); return; }
    throw error;
  }
});

for (const [action, status] of [["archive", "ARCHIVED"], ["restore", "ACTIVE"]] as const) {
  projects.patch(`/:id/${action}`, requireRole("ADMIN"), validId, async (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success) { res.status(400).json({ error: "Send an empty JSON object for this action." }); return; }
    try {
      const project = await db.project.update({ where: { id: req.params.id as string }, data: { status }, select: publicProject });
      res.json({ project });
    } catch (error) {
      if (isCode(error, "P2025")) { res.status(404).json({ error: "Project not found." }); return; }
      throw error;
    }
  });
}
