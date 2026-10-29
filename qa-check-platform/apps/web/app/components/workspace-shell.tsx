import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "../lib/session";
import { dashboardPaths, roleNames } from "../lib/roles";
import LogoutButton from "../dashboard/logout-button";

export default function WorkspaceShell({ user, active, children }: { user: SessionUser; active: "overview" | "projects"; children: ReactNode }) {
  const label = roleNames[user.role];
  return <div className="dashboard-shell"><a className="skip-link" href="#workspace-main">Skip to content</a>
    <aside className="dashboard-sidebar"><Link href="/" className="dashboard-brand"><span aria-hidden="true">✓</span>QA Check<span className="brand-caption">PLATFORM</span></Link>
      <p className="nav-section-label">WORKSPACE</p><nav aria-label="Dashboard navigation">
        <Link aria-current={active === "overview" ? "page" : undefined} className={active === "overview" ? "dashboard-nav-active" : undefined} href={dashboardPaths[user.role]}><span aria-hidden="true">▦</span> Overview</Link>
        <Link aria-current={active === "projects" ? "page" : undefined} className={active === "projects" ? "dashboard-nav-active" : undefined} href="/projects"><span aria-hidden="true">▣</span> Projects</Link>
        <Link href={`${dashboardPaths[user.role]}#account-details`}><span aria-hidden="true">◉</span> Account details</Link>
      </nav><div className="sidebar-note"><span className="status-dot" /> Your {label.toLowerCase()} workspace<p>One place to focus on quality.</p></div>
      <div className="sidebar-account"><div className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><span>{label}</span></div></div><LogoutButton />
    </aside><div className="dashboard-workspace"><header className="dashboard-topbar"><span>Workspace <span aria-hidden="true">/</span><strong>{active === "projects" ? "Projects" : "Overview"}</strong></span><span className="role-badge">{label}</span></header>
      <main id="workspace-main" className="dashboard-main">{children}<footer className="dashboard-footer">QA Check Platform <span>Built for teams that care about quality.</span></footer></main>
    </div></div>;
}
