import type { SuggestionMap } from "./types.js";

export const networkSuggestions: SuggestionMap = {
  requestfailed: {
    code: "requestfailed",
    title: "Network Request Failed",
    problem: "A browser request failed before receiving a successful response.",
    whyItMatters: "Failed requests can break data loading, images, scripts, or user flows.",
    suggestedFix: ["Verify API URL.", "Check CORS.", "Check server status.", "Retry failed requests."],
    shortFix: "Verify URL, CORS, and server availability.",
  },
  response: {
    code: "response",
    title: "HTTP Error Response",
    problem: "A request returned an HTTP error status.",
    whyItMatters: "Broken resources can block features or produce incomplete pages.",
    suggestedFix: ["Check the endpoint status.", "Fix missing assets.", "Handle error responses in the UI."],
    shortFix: "Fix the failing endpoint or asset.",
  },
  "broken-link": {
    code: "broken-link",
    title: "Broken Link",
    problem: "A link target is unavailable or returns an error.",
    whyItMatters: "Broken links interrupt navigation and reduce trust.",
    suggestedFix: ["Verify the URL.", "Update stale links.", "Redirect removed pages."],
    shortFix: "Fix or redirect the link target.",
  },
  "blocked-external": {
    code: "blocked-external",
    title: "Blocked External Link",
    problem: "An external link rejected or blocked the checker.",
    whyItMatters: "Users may still encounter a broken or unavailable external destination.",
    suggestedFix: ["Manually verify the external destination.", "Replace unreliable links."],
    shortFix: "Verify the external link manually.",
  },
};
