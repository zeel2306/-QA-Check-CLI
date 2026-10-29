"use client";
import Link from "next/link";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="auth-shell"><section className="auth-card"><h1>Workspace unavailable</h1><p role="alert">We couldn’t load your dashboard. Please try again.</p><button className="primary" onClick={reset}>Try again</button><p><Link href="/login">Return to sign in</Link></p></section></main>;
}
