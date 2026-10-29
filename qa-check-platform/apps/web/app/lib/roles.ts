export type Role = "ADMIN" | "DEVELOPER" | "QA";
export const roleNames: Record<Role, string> = { ADMIN: "Admin", DEVELOPER: "Developer", QA: "QA Engineer" };
export const dashboardPaths: Record<Role, string> = {
  ADMIN: "/dashboard/admin", DEVELOPER: "/dashboard/developer", QA: "/dashboard/qa",
};
export function isRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "DEVELOPER" || value === "QA";
}
