import type { SuggestionMap } from "./types.js";

export const linkSuggestions: SuggestionMap = {
  "broken-internal-link": {
    code: "broken-internal-link",
    title: "Broken Internal Link",
    problem: "An internal link points to a target that does not exist.",
    whyItMatters: "Broken internal links cause 404 errors, hurt navigation, and harm SEO.",
    suggestedFix: ["Correct the href path or create the missing target page."],
    shortFix: "Correct the href path or create the missing target page.",
  },
  "broken-external-link": {
    code: "broken-external-link",
    title: "Broken External Link",
    problem: "An external link returned an HTTP error response.",
    whyItMatters: "Outdated or broken external links ruin user experience and lower site trust.",
    suggestedFix: ["Verify the external URL destination or update the link."],
    shortFix: "Verify external URL target or update destination.",
  },
  "suspicious-hash-link": {
    code: "suspicious-hash-link",
    title: "Suspicious Hash Link",
    problem: "Link uses empty or placeholder href='#'.",
    whyItMatters: "Placeholder hash links can trigger unexpected page scrolls when clicked.",
    suggestedFix: ["Replace placeholder '#' with actual target route or button element."],
    shortFix: "Replace placeholder '#' with actual target route or button element.",
  },
  "javascript-link": {
    code: "javascript-link",
    title: "JavaScript Link",
    problem: "Link uses inline 'javascript:' pseudo-protocol.",
    whyItMatters: "Inline JS links are inaccessible and violate CSP security best practices.",
    suggestedFix: ["Replace 'javascript:' link with a button or proper event handler."],
    shortFix: "Replace 'javascript:' link with a button or proper event handler.",
  },
  "invalid-link-target": {
    code: "invalid-link-target",
    title: "Invalid Link Target",
    problem: "Link href attribute is invalid or malformed.",
    whyItMatters: "Malformed link attributes prevent users from navigating.",
    suggestedFix: ["Provide a valid URL or path in href attribute."],
    shortFix: "Provide a valid URL or path in href attribute.",
  },
  "broken-link": {
    code: "broken-link",
    title: "Broken Link",
    problem: "A link points to an invalid or missing destination.",
    whyItMatters: "Broken links frustrate users and negatively impact search rankings.",
    suggestedFix: ["Verify and correct the link target destination."],
    shortFix: "Verify and correct the link target destination.",
  },
};
