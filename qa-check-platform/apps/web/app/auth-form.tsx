"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { dashboardPaths, isRole } from "./lib/roles";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (register && password !== form.get("confirmPassword")) { setError("Passwords do not match."); return; }
    if (register && new TextEncoder().encode(password).length > 72) { setError("Password must be at most 72 UTF-8 bytes."); return; }
    const body = { email: String(form.get("email")).trim(), password,
      ...(register ? { name: String(form.get("name")).trim() } : {}) };
    if (register && !body.name) { setError("Enter your full name."); return; }
    setLoading(true);
    try {
      const response = await fetch(`${api}/api/v1/auth/${mode}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Unable to complete request."); return; }
      if (register) setSuccess("Your account is ready. Sign in to continue.");
      else {
        const role: unknown = data.user?.role;
        if (!isRole(role)) { setError("Unable to determine your dashboard access. Please try again."); return; }
        setSuccess("Signed in. Opening your dashboard…"); router.replace(dashboardPaths[role]); router.refresh();
      }
    } catch { setError("Unable to reach the server. Please try again."); }
    finally { setLoading(false); }
  }

  return <main className="auth-shell"><section className="auth-card">
    <Link href="/" className="brand">✓ QA Check Platform</Link>
    <h1>{register ? "Create your account" : "Welcome back"}</h1>
    <p>{register ? "Get started with QA Check Platform." : "Sign in to your account."}</p>
    <form onSubmit={submit} aria-busy={loading}>
      <fieldset disabled={loading || Boolean(success && register)}>
        {register && <label>Full name<input name="name" autoComplete="name" required maxLength={100} /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : 1} maxLength={72} aria-describedby={register ? "password-help" : undefined} /></label>
        {register && <><small id="password-help">Use 12–72 characters, up to 72 UTF-8 bytes.</small>
          <label>Confirm password<input name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" required maxLength={72} /></label></>}
        <button type="button" className="visibility" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide passwords" : "Show passwords"}</button>
        <button type="submit" className="primary">{loading ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      {success && <p role="status" className="success">{success}</p>}
    </form>
    <p>{register ? "Already have an account?" : "New to QA Check?"} <Link href={register ? "/login" : "/register"}>{register ? "Sign in" : "Create an account"}</Link></p>
  </section></main>;
}
