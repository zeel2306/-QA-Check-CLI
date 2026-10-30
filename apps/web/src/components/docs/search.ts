import { docsHref, docsNavigation } from "./navigation";
import { troubleshootingTopics } from "./troubleshooting-data";
import { faqCategories } from "./faq-data";
import { errorGroups } from "./error-data";

interface SearchEntry { title: string; href: string; context: string; keywords: string; }

// A small static index shared with the rendered content; no external search service.
const searchEntries: SearchEntry[] = [
  { title: "Upload a structured report", href: "/docs#upload", context: "SaaS integration", keywords: "project token report JSON POST API ingestion worker" },
  { title: "Bring quality into CI", href: "/docs#ci", context: "SaaS integration", keywords: "CI secrets trusted workflows artifacts quality gate" },
  ...docsNavigation.map(page => ({ title: page.title, href: docsHref(page.slug), context: "Guide", keywords: `${page.description} ${page.keywords}` })),
  ...troubleshootingTopics.map(topic => ({ title: topic.title, href: `/docs/troubleshooting#${topic.id}`, context: `Troubleshooting · ${topic.kind}`, keywords: `${topic.symptoms} ${topic.causes}` })),
  ...faqCategories.flatMap(category => category.questions.map(item => ({ title: item.question, href: `/docs/faq#${item.id}`, context: `FAQ · ${category.title}`, keywords: item.answer }))),
  ...errorGroups.flatMap(group => group.entries.map(entry => ({ title: entry.message, href: `/docs/errors#${entry.id}`, context: `Error reference · ${group.title}`, keywords: `${entry.meaning} ${entry.causes}` }))),
];

export function searchDocumentation(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return searchEntries.filter(entry => {
    const text = `${entry.title} ${entry.context} ${entry.keywords}`.toLowerCase();
    return terms.every(term => text.includes(term));
  });
}
