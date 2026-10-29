import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRole, type Role } from "./roles";

export type SessionUser = { id: string; name: string; email: string; role: Role };
export async function authenticatedRequest(path: string): Promise<Response> {
  const jar = await cookies();
  const cookie = jar.get("__Host-qa_session") ?? jar.get("qa_session");
  if (!cookie || !/^[a-f0-9]{64}$/.test(cookie.value)) redirect("/login");
  const response = await fetch(`${process.env.API_URL ?? "http://localhost:4000"}${path}`, {
    headers: { Cookie: `${cookie.name}=${cookie.value}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) redirect("/login");
  return response;
}

export async function getSessionUser(): Promise<SessionUser> {
  const response = await authenticatedRequest("/api/v1/auth/me");
  if (!response.ok) throw new Error("Unable to verify your session.");
  const { user } = await response.json();
  if (!user || typeof user.id !== "string" || typeof user.name !== "string" || typeof user.email !== "string" || !isRole(user.role)) {
    throw new Error("Invalid account response.");
  }
  return user;
}
