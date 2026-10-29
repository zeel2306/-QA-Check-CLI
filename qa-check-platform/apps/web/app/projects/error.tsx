"use client";
import Link from "next/link";
export default function ProjectsError({ reset }: { reset: () => void }) { return <section className="project-state"><h1>Projects unavailable</h1><p role="alert">We couldn’t load projects. Please try again.</p><button className="project-button" onClick={reset}>Try again</button><p><Link href="/dashboard">Return to dashboard</Link></p></section>; }
