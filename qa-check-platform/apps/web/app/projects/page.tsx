import Link from "next/link";
import { authenticatedRequest, getSessionUser } from "../lib/session";
import ProjectCard from "./project-card";
import type { ProjectList } from "./types";
export const dynamic = "force-dynamic";
type Query = Promise<Record<string, string | string[] | undefined>>;
export default async function Projects({ searchParams }: { searchParams: Query }) {
  const user = await getSessionUser();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const status = query.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  const page = typeof query.page === "string" ? query.page : "1";
  const parameters = new URLSearchParams({ q, page, status, limit: "12" });
  const response = await authenticatedRequest(`/api/v1/projects?${parameters}`);
  if (response.status === 400 || response.status === 403) return <section className="project-state"><h1>{response.status === 403 ? "Access denied" : "Invalid project filters"}</h1><p>{response.status === 403 ? "Only admins can view archived projects." : "Check the search text and page number."}</p><Link className="project-button" href="/projects">View active projects</Link></section>;
  if (!response.ok) throw new Error("Unable to load projects.");
  const data = await response.json() as ProjectList;
  const pageLink = (next: number) => `/projects?${new URLSearchParams({ q, status, page: String(next) })}`;
  return <><div className="dashboard-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Projects</h1><p>A shared home for the work your team is building.</p></div>{user.role !== "QA" && <Link className="project-button" href="/projects/new">Create Project</Link>}</div>
    {query.notice === "read-only" && <p className="project-notice" role="status">Your QA role has read-only project access.</p>}
    <form action="/projects" method="get" className="project-filters"><div><label htmlFor="project-search">Search projects</label><input id="project-search" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search by name or framework" /></div>
      {user.role === "ADMIN" && <div><label htmlFor="project-status">Project status</label><select id="project-status" name="status" defaultValue={status}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></div>}<button className="project-button secondary" type="submit">Search</button>{(q || status === "ARCHIVED") && <Link href="/projects">Clear filters</Link>}</form>
    <div className="section-heading"><h2>{status === "ARCHIVED" ? "Archived projects" : "Active projects"}</h2><span>{data.pagination.total} {data.pagination.total === 1 ? "project" : "projects"}</span></div>
    {data.projects.length ? <div className="project-grid">{data.projects.map(project => <ProjectCard key={project.id} project={project} />)}</div> : <section className="project-state"><span aria-hidden="true">▣</span><h2>{q ? "No matching projects" : "No projects yet"}</h2><p>{q ? "Try a different name or framework." : status === "ARCHIVED" ? "Archived projects will appear here." : user.role === "QA" ? "Projects shared with your workspace will appear here." : "Create your first project to get started."}</p>{user.role !== "QA" && status === "ACTIVE" && !q && <Link className="project-button" href="/projects/new">Create Project</Link>}</section>}
    <nav className="project-pagination" aria-label="Project pagination">{data.pagination.page > 1 && <Link className="project-button secondary" href={pageLink(data.pagination.page - 1)}>Previous</Link>}<span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}</span>{data.pagination.page < data.pagination.totalPages && <Link className="project-button secondary" href={pageLink(data.pagination.page + 1)}>Next</Link>}</nav>
    <p className="workspace-permissions-note">Single-workspace preview: active projects are shared with all signed-in users.</p>
  </>;
}
