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
};
