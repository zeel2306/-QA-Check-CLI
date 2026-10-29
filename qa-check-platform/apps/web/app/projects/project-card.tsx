import Link from "next/link";
import { projectDate, type Project } from "./types";
export default function ProjectCard({ project }: { project: Project }) {
  const details = `/projects/${project.id}${project.status === "ARCHIVED" ? "?archived=1" : ""}`;
  return <article className="project-card"><div className="project-card-header"><span className="project-monogram" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span><span className={`project-status ${project.status.toLowerCase()}`}>{project.status === "ACTIVE" ? "Active" : "Archived"}</span></div>
    <h2><Link href={details}>{project.name}</Link></h2><p className="project-description">{project.description || "No description provided."}</p><dl className="project-card-meta"><div><dt>Framework</dt><dd>{project.framework || "Not specified"}</dd></div><div><dt>Created</dt><dd>{projectDate(project.createdAt)}</dd></div></dl><Link className="project-details-link" href={details}>View Details <span aria-hidden="true">→</span></Link></article>;
}
