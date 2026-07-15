import type { SuggestionMap } from "./types.js";

export const performanceSuggestions: SuggestionMap = {
  "slow-page": {
    code: "slow-page",
    title: "Slow Page",
    problem: "A page is taking longer than expected to load.",
    whyItMatters: "Slow pages increase bounce rates and reduce conversion.",
    suggestedFix: [
      "Enable caching.",
      "Compress assets.",
      "Optimize images.",
      "Use a CDN.",
      "Reduce render-blocking JavaScript and CSS.",
    ],
    shortFix: "Cache, compress, optimize assets, and reduce blocking work.",
  },
  "slow-request": {
    code: "slow-request",
    title: "Slow Request",
    problem: "A network request is responding slowly.",
    whyItMatters: "Slow requests delay rendering and user interaction.",
    suggestedFix: ["Enable caching.", "Compress responses.", "Optimize server work.", "Use a CDN."],
    shortFix: "Cache and optimize slow responses.",
  },
  "slow-ttfb": {
    code: "slow-ttfb",
    title: "Slow TTFB",
    problem: "The server takes too long to start responding.",
    whyItMatters: "High TTFB delays every downstream page milestone.",
    suggestedFix: ["Profile backend work.", "Add edge caching.", "Optimize database queries."],
    shortFix: "Reduce server response time.",
  },
};
