export default function Loading() {
  return <main className="dashboard-loading" aria-busy="true"><div className="loading-mark" aria-hidden="true">✓</div><h1>Loading your workspace…</h1><p role="status">Verifying your session and dashboard access.</p></main>;
}
