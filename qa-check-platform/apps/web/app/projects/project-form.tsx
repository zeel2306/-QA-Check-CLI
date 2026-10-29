"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Project } from "./types";
const api = process.env.NEXT_PUBLIC_API_URL ?? "";
type FormFields = { name: string; description: string; framework: string; repositoryUrl: string };
type Errors = Partial<Record<keyof FormFields, string>>;
export default function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const [values, setValues] = useState<FormFields>({ name: project?.name ?? "", description: project?.description ?? "", framework: project?.framework ?? "", repositoryUrl: project?.repositoryUrl ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);
  function validate(): Errors {
    const next: Errors = {};
    if (!values.name.trim()) next.name = "Project name is required.";
    if (values.name.trim().length > 100) next.name = "Use at most 100 characters.";
    if (values.description.trim().length > 4000) next.description = "Use at most 4,000 characters.";
    if (values.framework.trim().length > 100) next.framework = "Use at most 100 characters.";
    if (values.repositoryUrl.trim()) {
      try { const url = new URL(values.repositoryUrl.trim()); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(); }
      catch { next.repositoryUrl = "Enter an HTTP or HTTPS URL without embedded credentials."; }
      if (values.repositoryUrl.trim().length > 2048) next.repositoryUrl = "Use at most 2,048 characters.";
    }
    return next;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); const next = validate(); setErrors(next);
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return; }
    setLoading(true);
    try {
      const response = await fetch(`${api}/api/v1/projects${project ? `/${project.id}` : ""}`, { method: project ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (response.status === 401) { router.replace("/login"); router.refresh(); return; }
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to save the project.");
        if (data.fieldErrors) { const inline: Errors = {}; for (const key of ["name", "description", "framework", "repositoryUrl"] as const) if (data.fieldErrors[key]?.[0]) inline[key] = data.fieldErrors[key][0]; setErrors(inline); }
        return;
      }
      setSuccess(project ? "Project updated. Opening details…" : "Project created. Opening details…");
      router.replace(`/projects/${data.project.id}?notice=${project ? "updated" : "created"}`); router.refresh();
    } catch { setError("Unable to reach the server. Please try again."); }
    finally { setLoading(false); }
  }
  const field = (key: keyof FormFields, label: string, maxLength: number, placeholder?: string) => <div className="project-field"><label htmlFor={key}>{label}{key !== "name" && <span> Optional</span>}</label>{key === "description" ? <textarea id={key} value={values[key]} maxLength={maxLength} rows={5} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={event => setValues({ ...values, [key]: event.target.value })} /> : <input id={key} required={key === "name"} value={values[key]} maxLength={maxLength} placeholder={placeholder} type={key === "repositoryUrl" ? "url" : "text"} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={event => setValues({ ...values, [key]: event.target.value })} />}{errors[key] && <p id={`${key}-error`} className="project-field-error">{errors[key]}</p>}</div>;
  return <form onSubmit={submit} noValidate className="project-form" aria-busy={loading}><fieldset disabled={loading || Boolean(success)}>{field("name", "Project Name", 100, "e.g. Customer portal")}{field("description", "Description", 4000)}{field("framework", "Framework", 100, "e.g. Next.js")}{field("repositoryUrl", "Repository URL", 2048, "https://example.com/team/repository")}<p className="project-help">Repository links are stored for reference. No repository connection or synchronization is performed.</p><div className="project-form-actions"><button className="project-button" type="submit">{loading ? "Saving…" : project ? "Save Changes" : "Create Project"}</button><Link className="project-button secondary" href={project ? `/projects/${project.id}` : "/projects"}>Cancel</Link></div></fieldset>{error && <p className="project-error" role="alert">{error}</p>}{success && <p className="project-notice" role="status">{success}</p>}</form>;
}
