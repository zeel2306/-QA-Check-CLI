import type { ReactNode } from "react";
import { CopyCommand } from "./copy-command";
import styles from "./landing.module.css";

const github = "https://github.com/zeel2306/-QA-Check-CLI";
const npm = "https://www.npmjs.com/package/qa-check-cli";

function Arrow() { return <span aria-hidden="true">↗</span>; }

function Brand() {
  return <a className={styles.brand} href="#top" aria-label="QA Check Platform home">
    <span className={styles.logo} aria-hidden="true">✓</span>
    <span>QA Check{" "}<span className={styles.brandSub}>Platform</span>
    </span>
  </a>;
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className={styles.sectionHeading}>
    <p className={styles.eyebrow}>{eyebrow}</p>
    <h2>{title}</h2>
    <p>{children}</p>
  </div>;
}

function AuditPreview() {
  const checks = ["Accessibility", "Performance", "SEO", "Responsive"];
  return (
    <figure className={styles.preview} aria-label="Illustrative audit report, not live project data">
      <div className={styles.previewTop}>
        <span>
          <i />
          <i />
          <i />
        </span>
        <span>QA CHECK / AUDIT REPORT</span>
        <span aria-hidden="true">↗</span>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.previewTitle}>
          <div>
            <p>PROJECT OVERVIEW</p>
            <div className={styles.previewHeading}>Your next release.</div>
          </div>
          <span className={styles.sampleBadge}>Illustrative preview</span>
        </div>
        <div className={styles.reportSummary}>
          <div className={styles.qualityRing}>
            <span aria-hidden="true">✓</span>
          </div>
          <div>
            <span className={styles.mutedLabel}>ONE REPORT. A CLEARER PICTURE.</span>
            <div className={styles.summaryHeading}>Quality, made visible.</div>
            <p>Find the issues. Understand the next step.</p>
          </div>
        </div>
        <div className={styles.checkGrid}>{checks.map((check, index) => <div key={check}>
          <span className={styles.checkIcon} aria-hidden="true">{["◎", "ϟ", "⌕", "▣"][index]}</span>
          <span>{check}</span>
          <span className={styles.miniBar} aria-hidden="true">
            <i style={{ width: `${[76, 58, 88, 68][index]}%` }} />
          </span>
        </div>)}</div>
        <div className={styles.finding}>
          <span className={styles.findingIcon} aria-hidden="true">!</span>
          <div>
            <strong>Make every interaction accessible</strong>
            <p>Example finding · Add a descriptive button label</p>
          </div>
          <span aria-hidden="true">↗</span>
        </div>
      </div>
      <figcaption>
        <span className={styles.statusDot} />Illustrative preview · Real workspaces require configured services.</figcaption>
    </figure>
  );
}

const features = [
  { icon: "⌘", title: "Automated Quality Audits", text: "Bring code quality and website checks into one repeatable, framework-aware audit." },
  { icon: "◎", title: "Accessibility Testing", text: "Spot accessibility barriers with axe-core checks and practical findings for your team." },
  { icon: "ϟ", title: "Performance Insights", text: "Understand Lighthouse performance signals and discover where pages can improve." },
  { icon: "⌕", title: "SEO Validation", text: "Check the essentials, from page titles and metadata to canonical and social tags." },
  { icon: "▣", title: "Responsive Testing", text: "Find viewport overflow, clipped content, and layout issues across screen sizes." },
  { icon: "↗", title: "Actionable Reports", text: "Turn audit findings into clear next steps with shareable JSON, HTML, and PDF reports." },
];
const steps = [
  { title: "Install the CLI", text: "Add QA Check to your local development toolkit.", available: true },
  { title: "Run a quality audit", text: "Audit your project from the terminal.", available: true },
  { title: "Generate a JSON report", text: "Keep structured findings ready for review.", available: true },
  { title: "Upload to the platform", text: "Use the report upload API with a configured workspace.", available: false },
  { title: "Review history & findings", text: "Review imported runs, scores, and findings.", available: false },
];

export function LandingPage() {
  return (
    <div id="top" className={styles.landing}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.navInner}>
          <Brand />
          <nav aria-label="Main navigation" className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="/docs">Documentation</a>
            <a href="#open-source">Open Source</a>
            <a href={github}>GitHub <Arrow />
            </a>
            <a href="/login">Log in</a>
          </nav>
          <a className={styles.navCta} href="/register">Get Started <span aria-hidden="true">→</span>
          </a>
        </div>
      </header>
      <main id="main">
        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <a className={styles.releasePill} href={npm}>
              <span className={styles.statusDot} />Open-source CLI. Ready for your next release.<Arrow />
            </a>
            <h1 id="hero-title">Ship Better Software <span>with Confidence</span>
              <span className={styles.heroPeriod}>.</span>
            </h1>
            <p className={styles.heroDescription}>Catch the issues before your users do. Run quality audits from your terminal. Bring imported reports into a private workspace when account and data services are configured.</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#open-source">Explore QA Check CLI <span aria-hidden="true">→</span>
              </a>
              <a className={styles.secondaryButton} href="#platform">Explore Platform <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className={styles.heroNotes}>
              <span>✓ Runs locally</span>
              <span>✓ Open source</span>
              <span>✓ No account needed for CLI</span>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.visualGrid} aria-hidden="true" />
            <AuditPreview />
            <div className={styles.terminalNote}>
              <span aria-hidden="true">❯</span>
              <code>qa-check .</code>
              <span>From terminal to clarity.</span>
            </div>
          </div>
        </section>
        <div className={styles.scopeStrip}>
          <div className={styles.container}>
            <span>ONE TOOLKIT. MORE PERSPECTIVE.</span>
            <p>Code quality <i />Accessibility <i />Performance <i />SEO <i />Responsive UI</p>
          </div>
        </div>
        <section id="features" className={`${styles.container} ${styles.section}`} aria-labelledby="features-title">
          <div className={styles.headingRow}>
            <div>
              <p className={styles.eyebrow}>THE QUALITY TOOLKIT</p>
              <h2 id="features-title">Small details.<br />Better releases.</h2>
            </div>
            <p>Look beyond “it works on my machine.”<br />Get a broader view of your application with checks available in QA Check CLI.</p>
          </div>
          <div className={styles.featureGrid}>{features.map((feature, index) => <article className={styles.featureCard} key={feature.title}>
            <div className={styles.cardTop}>
              <span className={styles.featureIcon} aria-hidden="true">{feature.icon}</span>
              <span>0{index + 1}</span>
            </div>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>)}</div>
        </section>
        <section id="how-it-works" className={styles.workflowSection} aria-labelledby="workflow-title">
          <div className={`${styles.container} ${styles.section}`}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>FROM CODE TO CLARITY</p>
              <h2 id="workflow-title">A simple flow. A bigger picture.</h2>
              <p>Audit locally, then bring structured results into your configured workspace.</p>
            </div>
            <ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <span className={step.available ? styles.available : styles.planned}>{step.available ? "Available in CLI" : "Requires services"}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>)}</ol>
            <p className={styles.workflowNote}>
              <span aria-hidden="true">↳</span> Scans run locally. Uploads and history require configured account, database, private storage, and worker services. <a href="/docs#upload">Read the upload guide →</a></p>
          </div>
        </section>
        <section id="platform" className={`${styles.container} ${styles.section}`} aria-label="CLI and platform comparison">
          <SectionHeading eyebrow="TWO PARTS. ONE QUALITY MINDSET." title="Your terminal. Your quality workspace.">The CLI does the auditing. The platform brings imported results together.</SectionHeading>
          <div className={styles.comparison}>
            <article className={styles.cliCard}>
              <div className={styles.comparisonTop}>
                <span className={styles.eyebrow}>FOR DEVELOPERS</span>
                <span className={styles.available}>Available now</span>
              </div>
              <span className={styles.comparisonIcon} aria-hidden="true">&gt;_</span>
              <h3>QA Check CLI</h3>
              <p>Your open-source quality companion.<br />Right where you build.</p>
              <ul>{["Open-source developer tool", "Runs locally", "Automated quality checks", "JSON, HTML, and PDF reports"].map(item => <li key={item}>
                <span aria-hidden="true">✓</span>{item}</li>)}</ul>
              <a className={styles.secondaryButton} href={github}>Explore the repository <Arrow />
              </a>
            </article>
            <article className={styles.platformCard}>
              <div className={styles.comparisonTop}>
                <span className={styles.eyebrow}>FOR DEVELOPMENT TEAMS</span>
                <span className={styles.planned}>SaaS foundation</span>
              </div>
              <span className={styles.comparisonIcon} aria-hidden="true">▦</span>
              <h3>QA Check Platform</h3>
              <p>A private view of software quality.<br />Built around imported CLI reports.</p>
              <ul>{[["Web-based dashboard", "Implemented"], ["Project management", "Implemented"], ["Imported scan history", "Requires services"], ["Quality score visualization", "Imported results"], ["Team invitations & management", "Planned"]].map(([item, status]) => <li key={item}>
                <span aria-hidden="true">◌</span>{item}<small>{status}</small>
              </li>)}</ul>
              <p className={styles.platformDisclaimer}>Explore the sample dashboard without an account. Real workspaces need configured services. Hosted scan execution and team management are not implemented; production readiness is not certified.</p>
              <a className={styles.secondaryButton} href="/demo">Explore the demo <Arrow /></a>
            </article>
          </div>
        </section>
        <section id="open-source" className={`${styles.container} ${styles.openSource}`} aria-labelledby="open-source-title">
          <div>
            <p className={styles.eyebrow}>BUILT IN THE OPEN</p>
            <h2 id="open-source-title">Better quality starts<br />with one command.</h2>
            <p>Explore the code. Run your first audit.<br />Make QA part of the way you build.</p>
            <div className={styles.sourceLinks}>
              <a href={github}>View on GitHub <Arrow />
              </a>
              <a href={npm}>View on npm <Arrow />
              </a>
            </div>
          </div>
          <div className={styles.installPanel}>
            <div className={styles.installHeader}>
              <span aria-hidden="true">&gt;_</span> YOUR TERMINAL <span className={styles.installBadge}>npm</span>
            </div>
            <h3>Start with QA Check CLI</h3>
            <CopyCommand />
            <a href={`${github}#readme`}>Read the installation & usage guide <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerTop}`}>
          <div>
            <Brand />
            <p>A clearer path to better software.</p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="/features">Features</a>
            <a href="/docs">Documentation <Arrow />
            </a>
            <a href="/pricing">Pricing</a>
            <a href="/demo">Demo</a>
            <a href="/login">Log in</a>
            <a href="/register">Create a workspace</a>
            <a href={github}>GitHub <Arrow />
            </a>
            <a href={npm}>npm package <Arrow />
            </a>
          </nav>
        </div>
        <div className={`${styles.container} ${styles.footerBottom}`}>
          <p>© {new Date().getFullYear()} QA Check Platform.</p>
          <span>CLI available now · Platform in development</span>
        </div>
      </footer>
    </div>
  );
}
