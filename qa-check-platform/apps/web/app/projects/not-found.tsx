import Link from "next/link";
export default function ProjectNotFound() { return <section className="project-state"><h1>Project not found</h1><p>This project does not exist or is unavailable to your account.</p><Link className="project-button" href="/projects">Back to projects</Link></section>; }
