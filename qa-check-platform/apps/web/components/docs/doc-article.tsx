import Link from "next/link";
import { docsHref, docsNavigation } from "./navigation";
import type { DocumentationPage } from "./content";
import styles from "./docs.module.css";

export function DocArticle({ page }: { page: DocumentationPage }) {
  const index = docsNavigation.findIndex(item => item.slug === page.slug);
  const previous = docsNavigation[index - 1];
  const next = docsNavigation[index + 1];
  return <>
    <nav aria-label="Breadcrumbs" className={styles.breadcrumbs}>
      <Link href="/">Home</Link>
      <span aria-hidden="true">/</span>{page.slug ? <>
        <Link href="/docs">Docs</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{page.title}</span>
      </> : <span aria-current="page">Docs</span>}</nav>
    <div className={styles.articleGrid}>
      <article className={styles.article}>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          <div className={styles.verified}>CLI v2.0.0 <span aria-hidden="true">·</span> Based on this repository’s implementation</div>
        </header>
        {page.sections.map(section => <section id={section.id} className={styles.section} key={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title}<a href={`#${section.id}`} aria-label={`Link to ${section.title}`}>#</a>
          </h2>{section.body}</section>)}
        <nav className={styles.pagination} aria-label="Documentation pages">
          {previous ? <Link href={docsHref(previous.slug)}>
            <small>← Previous</small>
            <strong>{previous.title}</strong>
          </Link> : <div />}
          {next ? <Link href={docsHref(next.slug)}>
            <small>Next →</small>
            <strong>{next.title}</strong>
          </Link> : <Link href="/">
            <small>Back to product →</small>
            <strong>QA Check Platform</strong>
          </Link>}
        </nav>
      </article>
      <aside className={styles.toc} aria-label="On this page">
        <details open>
          <summary>On this page</summary>
          <nav aria-label="Table of contents">{page.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
        </details>
        <p>Platform features are still in development. Start with the CLI.</p>
      </aside>
    </div>
  </>;
}
