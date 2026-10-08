import type { SuggestionMap } from "./types.js";

export const consoleSuggestions: SuggestionMap = {
  console: {
    code: "console",
    title: "Console Error",
    problem: "The page logged an error in the browser console.",
    whyItMatters: "Console errors often indicate broken runtime behavior.",
    suggestedFix: ["Check browser console stack trace.", "Fix uncaught exceptions before deployment."],
    shortFix: "Inspect and fix the console stack trace.",
  },
  "javascript-exception": {
    code: "javascript-exception",
    title: "Javascript Exception",
    problem: "An uncaught runtime exception occurred during execution.",
    whyItMatters: "Runtime exceptions crash application features and disrupt user flows.",
    suggestedFix: ["Inspect the reported exception/stack trace, fix the underlying runtime error, and verify the affected route again."],
    shortFix: "Inspect the reported exception/stack trace, fix the underlying runtime error, and verify the affected route again.",
  },
  "console-error": {
    code: "console-error",
    title: "Console Error",
    problem: "Unexpected console errors were recorded during page navigation.",
    whyItMatters: "Console errors can degrade user experience and indicate underlying bugs.",
    suggestedFix: ["Remove or resolve unexpected console errors and verify the affected route runs without browser console errors."],
    shortFix: "Remove or resolve unexpected console errors and verify the affected route runs without browser console errors.",
  },
  "resource-load-error": {
    code: "resource-load-error",
    title: "Resource Load Error",
    problem: "The browser failed to load a requested subresource (404/network error).",
    whyItMatters: "Failed resource requests lead to broken images, missing scripts, or incomplete pages.",
    suggestedFix: ["Verify the requested resource path exists and is served correctly. Check public asset paths, imports, and generated URLs."],
    shortFix: "Verify the requested resource path exists and is served correctly. Check public asset paths, imports, and generated URLs.",
  },
};
