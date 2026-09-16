import type { QAIssue } from "../types/issue.js";

function normalizePart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:/._#-]+/g, "")
    .replace(/-+/g, "-");
}

export function createIssueFingerprint(
  issue: Pick<QAIssue, "category" | "code"> &
    Partial<Pick<QAIssue, "file" | "line" | "url" | "selector">>,
): string {
  const location = issue.file ?? issue.url ?? issue.selector ?? "global";
  const line = issue.line === undefined ? "" : `:${issue.line}`;
  const selector = issue.selector && issue.selector !== location ? `:${issue.selector}` : "";

  return [
    normalizePart(issue.category),
    normalizePart(issue.code),
    normalizePart(location),
    normalizePart(line),
    normalizePart(selector),
  ]
    .filter(Boolean)
    .join(":");
}
