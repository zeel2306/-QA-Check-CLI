"use client";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { dashboardPaths, isRole } from "../lib/roles";
import { useEffect, useState } from "react";
const api = process.env.NEXT_PUBLIC_API_URL ?? "";
export default function LogoutButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Revalidate on tab focus to avoid retaining a dashboard from a revoked session.
  useEffect(() => {
    const verify = () => { void fetch(`${api}/api/v1/auth/me`, { credentials: "include", cache: "no-store" })
      .then(async res => {
        if (res.status === 401) { router.replace("/login"); router.refresh(); return; }
        if (res.ok) { const { user } = await res.json(); const role: unknown = user?.role; if (isRole(role) && pathname.startsWith("/dashboard") && pathname !== dashboardPaths[role]) { router.replace(dashboardPaths[role]); router.refresh(); } }
      }).catch(() => {}); };
    window.addEventListener("focus", verify);
    const timer = window.setInterval(verify, 60000);
    return () => { window.removeEventListener("focus", verify); window.clearInterval(timer); };
  }, [router, pathname]);
  async function logout() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${api}/api/v1/auth/logout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      router.replace("/login"); router.refresh();
    } catch { setError("Unable to sign out. Please try again."); setLoading(false); }
  }
  return <><button className="dashboard-logout" onClick={logout} disabled={loading}>{loading ? "Signing out…" : "Log out"}</button>{error && <p className="error" role="alert">{error}</p>}</>;
}
