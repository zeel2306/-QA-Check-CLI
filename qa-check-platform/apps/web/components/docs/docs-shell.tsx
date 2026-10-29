"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsHref, docsNavigation, sourceLinks } from "./navigation";
import styles from "./docs.module.css";
import { searchDocumentation } from "./search";

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  const mobile = useRef<HTMLDetailsElement>(null);
  const desktopId = useId();
  const mobileId = useId();
  const searching = query.trim().length > 0;
  const matches = searchDocumentation(query);

  function closeMobileNavigation() {
    if (mobile.current) mobile.current.open = false;
  }

  function navigation(id: string) {
    return <>
      <label className={styles.searchLabel} htmlFor={id}>Search documentation</label>
      <div className={styles.searchField}>
        <span aria-hidden="true">⌕</span>
        <input id={id} type="search" placeholder="Search guides & topics…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <p className={styles.resultCount} role="status">{searching ? `${matches.length} matching result${matches.length === 1 ? "" : "s"}` : "CLI v2.0.0 · Documentation"}</p>
      <nav aria-label="Documentation navigation" className={`${styles.navigation} ${searching ? styles.searchResults : ""}`}>
        {!searching && docsNavigation.map(page => <Link key={page.slug} href={docsHref(page.slug)} aria-current={pathname === docsHref(page.slug) ? "page" : undefined} onClick={closeMobileNavigation}>
          <span className={styles.navNumber}>{String(docsNavigation.indexOf(page) + 1).padStart(2, "0")}</span>
          <span>{page.title}</span>
          <span className={styles.navArrow} aria-hidden="true">↗</span>
        </Link>)}
        {searching && matches.map(result => <a key={result.href} href={result.href} onClick={closeMobileNavigation} className={styles.searchResult}>
          <span>
            <small>{result.context}</small>{result.title}</span>
          <span aria-hidden="true">↗</span>
        </a>)}
        {searching && !matches.length && <p className={styles.emptySearch}>No results match “{query}”. Try “Chrome”, “skipped”, or “reports”.</p>}
      </nav>
      {query && <button className={styles.clearSearch} type="button" onClick={() => setQuery("")}>Clear filter</button>}
    </>;
  }

  return <div className={styles.docs} data-theme={dark ? "dark" : "light"}>
    <a className={styles.skipLink} href="#docs-main">Skip to documentation</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="QA Check Documentation home">
        <span aria-hidden="true">✓</span>
        <div>QA Check{" "}<small>DOCUMENTATION</small>
        </div>
      </Link>
      <div className={styles.headerLinks}>
        <Link href="/">Platform home</Link>
        <a href={sourceLinks.github}>GitHub ↗</a>
        <button type="button" onClick={() => setDark(value => !value)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} aria-pressed={dark}>{dark ? "☀ Light" : "☾ Dark"}</button>
      </div>
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Documentation sidebar">{navigation(desktopId)}<div className={styles.sidebarNote}>
        <span className={styles.eyebrow}>BUILD WITH CONFIDENCE</span>
        <p>Local audits today.<br />A shared quality workspace, next.</p>
        <Link href="/docs/platform">See platform status <span aria-hidden="true">→</span>
        </Link>
      </div>
      </aside>
      <div className={styles.content}>
        <details className={styles.mobileNavigation} ref={mobile}>
          <summary>Browse documentation <span aria-hidden="true">⌄</span>
          </summary>
          <div>{navigation(mobileId)}</div>
        </details>
        <main id="docs-main" tabIndex={-1}>{children}</main>
        <footer className={styles.footer}>
          <span>QA Check · Public documentation</span>
          <a href={sourceLinks.npm}>npm package ↗</a>
          <a href={sourceLinks.github}>Source code ↗</a>
        </footer>
      </div>
    </div>
  </div>;
}

