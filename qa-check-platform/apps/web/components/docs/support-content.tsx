import Link from "next/link";
import { CodeBlock } from "./code-block";
import { FaqGroup } from "./faq-group";
import { troubleshootingTopics } from "./troubleshooting-data";
import { faqCategories } from "./faq-data";
import { errorGroups } from "./error-data";
import type { DocumentationPage } from "./types";
import styles from "./docs.module.css";

export const supportDocumentation: DocumentationPage[] = [
  {
    slug: "troubleshooting", title: "Find the cause. Verify the fix.", eyebrow: "SUPPORT / TROUBLESHOOTING",
    description: "A practical guide to CLI setup, runtime failures, and incomplete evidence. Start with the actual message, then confirm the affected work completes.",
    sections: [
      {
        id: "start-here", title: "Start with the failing stage", body: <>
          <p>Record <code>qa-check --version</code>, <code>node --version</code>, the command, selected project, scanner message, and relevant report evidence. Keep credentials and private application details out of shared diagnostics.</p>
          <p>
            <strong>Environment</strong> problems concern tools, browsers, paths, or permissions. <strong>CLI configuration</strong> problems concern inputs and settings. <strong>Project</strong> failures concern the application's own code or build. <strong>Scan evidence</strong> and <strong>report output</strong> need separate checks; an exit of zero alone does not prove either is complete.</p>
          <p>For message wording, use the <Link href="/docs/errors">error reference</Link>. Numeric process exit rules are documented in <Link href="/docs/commands#profiles">Profiles & exit codes</Link>, not assigned as identifiers to each problem.</p>
        </>
      },
      ...troubleshootingTopics.map(topic => ({
        id: topic.id, title: topic.title,
        body: <div className={styles.supportTopic}>
          <span className={styles.topicKind}>{topic.kind}</span>
          <h3>Symptoms</h3>
          <p>{topic.symptoms}</p>
          <h3>Likely causes</h3>
          <p>{topic.causes}</p>
          <h3>Resolution</h3>
          <ol>{topic.steps.map(step => <li key={step}>{step}</li>)}</ol>
          {topic.command && <CodeBlock label={`${topic.title} commands`} code={topic.command} />}
          <div className={styles.callout}>
            <strong>Confirm the fix</strong>
            <p>{topic.confirm}</p>
          </div>
          <p>
            <Link href={topic.related}>Related guide →</Link>
          </p>
          <p className={styles.sourceNote}>Verified against: {topic.source}</p>
        </div>,
      })),
    ],
  },
  {
    slug: "faq", title: "Questions, answered.", eyebrow: "SUPPORT / FAQ",
    description: "Straight answers about the CLI, quality evidence, reports, and the platform's development status.",
    sections: faqCategories.map(category => ({ id: category.id, title: category.title, body: <FaqGroup questions={category.questions} /> })),
  },
  {
    slug: "errors", title: "Understand the diagnostic.", eyebrow: "SUPPORT / ERROR REFERENCE",
    description: "Source-verified messages and error categories, with the context needed to choose the next step.",
    sections: [
      {
        id: "reading-messages", title: "How to use this reference", body: <>
          <p>The entries below are message text, prefixes, or explicitly labeled categories from the implementation. <code>…</code> marks variable details or an abbreviated message. A slash separates distinct related messages; it is not text that the CLI necessarily prints as one line.</p>
          <p>There is no invented numeric error-code catalog here. OS codes, project compiler diagnostics, scanner statuses, and <Link href="/docs/commands#profiles">process exit codes</Link> describe different things. Preserve the full original message when investigating.</p>
          <p>Need a recovery checklist? Start with <Link href="/docs/troubleshooting">Troubleshooting</Link>. Optional-feature messages can be informational rather than fatal.</p>
        </>
      },
      ...errorGroups.map(group => ({
        id: group.id, title: group.title, body: <div className={styles.errorGroup}>
          {group.entries.map(entry => <article className={styles.errorEntry} id={entry.id} key={entry.id}>
            <h3>
              <code>{entry.message}</code>
              <a href={`#${entry.id}`} aria-label={`Link to ${entry.message}`}>#</a>
            </h3>
            <dl>
              <dt>Meaning</dt>
              <dd>{entry.meaning}</dd>
              <dt>Common causes</dt>
              <dd>{entry.causes}</dd>
              <dt>Recommended solution</dt>
              <dd>{entry.solution}</dd>
            </dl>
            <p>
              <Link href={entry.related}>Related troubleshooting & documentation →</Link>
            </p>
            <p className={styles.sourceNote}>Source: {entry.source}</p>
          </article>)}
        </div>
      })),
    ],
  },
];
