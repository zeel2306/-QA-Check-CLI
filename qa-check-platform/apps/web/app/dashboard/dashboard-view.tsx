import { redirect } from "next/navigation";
import { authenticatedRequest, getSessionUser, type SessionUser } from "../lib/session";
import { dashboardPaths, roleNames, type Role } from "../lib/roles";
import WorkspaceShell from "../components/workspace-shell";

type CardData = { label: string; value: string; description: string };
function DashboardCard({ card, index }: { card: CardData; index: number }) {
  return <article className="dashboard-card"><div className="card-top"><span className="card-icon" aria-hidden="true">{["▦", "◷", "✓"][index]}</span><span className="demo-tag">Demo data</span></div>
    <h2>{card.label}</h2><p className="metric-value">{card.value}</p><p className="card-description">{card.description}</p></article>;
}

function DashboardShell({ user, title, cards }: { user: SessionUser; title: string; cards: CardData[] }) {
  const label = roleNames[user.role];
  return <WorkspaceShell user={user} active="overview"><div className="dashboard-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>{title}</h1><p>Welcome, <strong>{user.name}</strong>. Here’s your workspace at a glance.</p></div><span className="workspace-status"><span className="status-dot" /> Signed in</span></div>
        <section className="dashboard-banner" aria-label="Dashboard status"><span className="banner-icon" aria-hidden="true">✦</span><div><h2>A foundation for better quality</h2><p>Your role-based workspace is ready. The metrics below are placeholders for future platform features.</p></div><span className="banner-label">MVP PREVIEW</span></section>
        <section aria-labelledby="overview-title"><div className="section-heading"><h2 id="overview-title">Workspace overview</h2><span>Demo data · No live metrics</span></div><div className="dashboard-card-grid">{cards.map((card, index) => <DashboardCard key={card.label} card={card} index={index} />)}</div></section>
        <section id="account-details" className="account-panel" aria-labelledby="account-title"><div><p className="eyebrow">ACCOUNT</p><h2 id="account-title">Your profile</h2><p>Signed in securely with your QA Check account.</p></div><dl><div><dt>Full name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access role</dt><dd><span className="role-badge">{label}</span></dd></div></dl></section>
  </WorkspaceShell>;
}

export default async function DashboardView({ role }: { role: Role }) {
  const user = await getSessionUser();
  if (user.role !== role) redirect(dashboardPaths[user.role]);
  const response = await authenticatedRequest(`/api/v1/dashboard/${role.toLowerCase()}`);
  // Handles a role change between the session lookup and dashboard request.
  if (response.status === 403) {
    const currentUser = await getSessionUser();
    if (currentUser.role !== role) redirect(dashboardPaths[currentUser.role]);
    throw new Error("Dashboard access denied.");
  }
  if (!response.ok) throw new Error("Unable to load dashboard.");
  const data = await response.json() as { title: string; cards: CardData[] };
  return <DashboardShell user={user} title={data.title} cards={data.cards} />;
}
