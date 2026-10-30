export const docsNavigation = [
  { slug: "", title: "Introduction", label: "Start here", description: "Meet the CLI and the platform.", keywords: "overview quick start github npm" },
  { slug: "installation", title: "Installation", label: "Getting started", description: "Set up your local quality toolkit.", keywords: "node npm windows requirements setup" },
  { slug: "commands", title: "CLI commands", label: "Reference", description: "Find the right command and options.", keywords: "audit init fix autofix doctor compare api flow test e2e flags" },
  { slug: "reports", title: "Understanding reports", label: "Guides", description: "Turn scan evidence into useful next steps.", keywords: "json html pdf markdown scores statuses findings" },
  { slug: "platform", title: "Platform guide", label: "The platform", description: "What exists today and what is planned.", keywords: "projects uploads history collaboration dashboard planned" },
  { slug: "troubleshooting", title: "Troubleshooting", label: "Support", description: "Diagnose setup, scan, and report problems.", keywords: "installation node powershell chromium chrome timeouts configuration permissions coverage" },
  { slug: "faq", title: "FAQ", label: "Support", description: "Answers to common CLI and platform questions.", keywords: "questions free internet supported projects reports platform" },
  { slug: "errors", title: "Error Reference", label: "Reference", description: "Understand actual diagnostic messages.", keywords: "errors messages configuration browser validation api diagnostics" },
] as const;

export function docsHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export const sourceLinks = {
  github: "https://github.com/zeel2306/-QA-Check-CLI",
  npm: "https://www.npmjs.com/package/qa-check-cli",
};
