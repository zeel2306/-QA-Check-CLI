"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "../lib/roles";
import type { Project } from "./types";
const api = process.env.NEXT_PUBLIC_API_URL ?? "";
export default function ProjectActions({ project, role }: { project: Project; role: Role }) {
  const dialog = useRef<HTMLDialogElement>(null); const router = useRouter();
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function changeStatus() {
    setLoading(true); setError(""); const action = project.status === "ACTIVE" ? "archive" : "restore";
    try {
      const response = await fetch(`${api}/api/v1/projects/${project.id}/${action}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (response.status === 401) { router.replace("/login"); router.refresh(); return; }
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Unable to update project status."); return; }
      dialog.current?.close(); router.replace(`/projects/${project.id}?${action === "archive" ? "archived=1&notice=archived" : "notice=restored"}`); router.refresh();
    } catch { setError("Unable to reach the server. Please try again."); }
    finally { setLoading(false); }
  }
  return <><div className="project-action-buttons">{role !== "QA" && project.status === "ACTIVE" && <Link className="project-button secondary" href={`/projects/${project.id}?edit=1`}>Edit Project</Link>}{role === "ADMIN" && (project.status === "ACTIVE" ? <button className="project-button danger" onClick={() => { setError(""); dialog.current?.showModal(); }}>Archive Project</button> : <button className="project-button" disabled={loading} onClick={changeStatus}>{loading ? "Restoring…" : "Restore Project"}</button>)}</div>
    {error && !dialog.current?.open && <p className="project-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="project-dialog" aria-labelledby="archive-title"><h2 id="archive-title">Archive this project?</h2><p><strong>{project.name}</strong> will be hidden from active project lists and cannot be edited until an admin restores it.</p><div className="project-form-actions"><button className="project-button danger" disabled={loading} onClick={changeStatus}>{loading ? "Archiving…" : "Confirm Archive"}</button><button className="project-button secondary" disabled={loading} onClick={() => dialog.current?.close()}>Cancel</button></div>{error && <p className="project-error" role="alert">{error}</p>}</dialog>
  </>;
}
