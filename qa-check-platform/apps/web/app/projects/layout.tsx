import type { ReactNode } from "react";
import WorkspaceShell from "../components/workspace-shell";
import { getSessionUser } from "../lib/session";
export default async function ProjectsLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <WorkspaceShell user={user} active="projects">{children}</WorkspaceShell>;
}
