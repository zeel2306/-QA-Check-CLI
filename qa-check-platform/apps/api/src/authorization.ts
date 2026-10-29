import type { RequestHandler } from "express";
import type { Role } from "./generated/prisma/client.js";

export type Principal = { id: string; name: string; email: string; role: Role };

// Keep role policy separate from session validation. A future organization
// membership resolver can supply the role without changing cookie authentication.
export function hasRole(principal: Principal, allowed: readonly Role[]): boolean {
  return allowed.includes(principal.role);
}

export function requireRole(...allowed: Role[]): RequestHandler {
  return (_req, res, next) => {
    const principal: Principal | undefined = res.locals.user;
    if (!principal) { res.status(401).json({ error: "Please log in to continue." }); return; }
    if (!hasRole(principal, allowed)) { res.status(403).json({ error: "You do not have permission to perform this action." }); return; }
    next();
  };
}
