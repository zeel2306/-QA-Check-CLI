export type Project = {
  id: string; name: string; description: string | null; framework: string | null;
  repositoryUrl: string | null; status: "ACTIVE" | "ARCHIVED";
  createdAt: string; updatedAt: string; createdBy: { name: string };
};
export type ProjectList = { projects: Project[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export function projectDate(value: string) { return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
