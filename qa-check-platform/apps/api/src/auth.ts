import { createHmac, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";

export const auth = Router();
export const cookieName = config.NODE_ENV === "production" ? "__Host-qa_session" : "qa_session";
const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
const publicUser = { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true } as const;
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(12, "Password must contain at least 12 characters.").max(72)
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes.");
const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email, password }).strict();
const loginSchema = z.object({ email, password: z.string().min(1).max(72)
  .refine(value => Buffer.byteLength(value, "utf8") <= 72) }).strict();
const tokenHash = (token: string) => createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");
// Same password work for missing accounts and incorrect passwords.
const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), config.BCRYPT_ROUNDS);

function readToken(req: Request): string | undefined {
  const value: unknown = req.cookies?.[cookieName];
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

async function createSession(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600000);
  const previous = readToken(req);
  await db.$transaction(async tx => {
    if (previous) await tx.session.deleteMany({ where: { tokenHash: tokenHash(previous) } });
    await tx.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
    await tx.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  });
  res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  const session = token ? await db.session.findUnique({
    where: { tokenHash: tokenHash(token) }, include: { user: { select: publicUser } },
  }) : null;
  if (!session || session.expiresAt <= new Date()) {
    if (session) await db.session.deleteMany({ where: { id: session.id } });
    res.clearCookie(cookieName, cookieOptions);
    res.status(401).json({ error: "Please log in to continue." });
    return;
  }
  res.locals.user = session.user;
  next();
}

// Compatibility for existing consumers; authentication remains session based.
export const requireSession = requireAuth;

auth.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.AUTH_RATE_LIMIT,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." } });

auth.post("/register", limiter, async (req, res) => {
  const input = registerSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Enter a name, valid email, and password of 12–72 UTF-8 bytes." }); return; }
  const passwordHash = await bcrypt.hash(input.data.password, config.BCRYPT_ROUNDS);
  try {
    const user = await db.user.create({ data: { name: input.data.name, email: input.data.email, passwordHash, role: "DEVELOPER" }, select: publicUser });
    res.status(201).json({ user, message: "Account created. You can now log in." });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ error: "An account with this email already exists." }); return;
    }
    throw error;
  }
});

auth.post("/login", limiter, async (req, res) => {
  const input = loginSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Enter a valid email and password." }); return; }
  const user = await db.user.findUnique({ where: { email: input.data.email } });
  const valid = await bcrypt.compare(input.data.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) { res.status(401).json({ error: "Invalid email or password." }); return; }
  await createSession(req, res, user.id);
  const { passwordHash: _passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

auth.post("/logout", async (req, res) => {
  const token = readToken(req);
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie(cookieName, cookieOptions);
  res.status(204).end();
});
auth.get("/me", requireAuth, (_req, res) => res.json({ user: res.locals.user }));
