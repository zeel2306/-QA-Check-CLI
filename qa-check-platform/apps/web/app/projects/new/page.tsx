import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/session";
import ProjectForm from "../project-form";
export default async function NewProject() {
  const user = await getSessionUser();
  if (user.role === "QA") redirect("/projects?notice=read-only");
  return <><Link className="project-back" href="/projects">← Back to projects</Link><div className="dashboard-heading"><div><p className="eyebrow">PROJECTS</p><h1>Create Project</h1><p>Add the basic details for your next project.</p></div></div><ProjectForm /></>;
}
