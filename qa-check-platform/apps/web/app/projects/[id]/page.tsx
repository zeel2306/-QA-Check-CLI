import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authenticatedRequest, getSessionUser } from "../../lib/session";
import { projectDate, type Project } from "../types";
import ProjectActions from "../project-actions";
import ProjectForm from "../project-form";
export default async function ProjectDetails({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser(); const { id } = await params; const query = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (query.archived === "1" && user.role !== "ADMIN") redirect("/projects");
  const response = await authenticatedRequest(`/api/v1/projects/${id}${query.archived === "1" ? "?includeArchived=true" : ""}`);
  if (response.status === 404 || response.status === 400) notFound();
  if (!response.ok) throw new Error("Unable to load project.");
  const { project } = await response.json() as { project: Project };
  if (query.edit === "1" && user.role === "QA") redirect(`/projects/${id}`);
  const editing = query.edit === "1" && project.status === "ACTIVE";
  const messages: Record<string, string> = { created: "Project created successfully.", updated: "Project updated successfully.", archived: "Project archived successfully.", restored: "Project restored successfully." };
  const notice = typeof query.notice === "string" ? messages[query.notice] : undefined;
  return <><Link className="project-back" href={project.status === "ARCHIVED" ? "/projects?status=ARCHIVED" : "/projects"}>← Back to projects</Link><div className="dashboard-heading"><div><p className="eyebrow">PROJECT DETAILS</p><h1>{editing ? "Edit Project" : project.name}</h1><p>{editing ? "Update your project’s basic details." : "The essentials, all in one place."}</p></div><span className={`project-status ${project.status.toLowerCase()}`}>{project.status === "ACTIVE" ? "Active" : "Archived"}</span></div>
    {notice && <p className="project-notice" role="status">{notice}</p>}
    {project.status === "ARCHIVED" && <p className="project-archive-note">This project is archived. Restore it before making changes.</p>}
    {editing ? <ProjectForm project={project} /> : <><section className="project-detail-panel" aria-labelledby="project-information"><h2 id="project-information">Project information</h2><dl><div><dt>Description</dt><dd className="project-full-description">{project.description || "No description provided."}</dd></div><div><dt>Framework</dt><dd>{project.framework || "Not specified"}</dd></div><div><dt>Repository URL</dt><dd>{project.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer">{project.repositoryUrl}</a> : "Not provided"}</dd></div><div><dt>Created date</dt><dd>{projectDate(project.createdAt)}</dd></div><div><dt>Created by</dt><dd>{project.createdBy.name}</dd></div></dl></section><ProjectActions project={project} role={user.role} />{user.role === "QA" && <p className="workspace-permissions-note">Your QA role has read-only project access.</p>}</>}
  </>;
}
