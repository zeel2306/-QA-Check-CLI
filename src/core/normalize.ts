import { createIssueFingerprint } from "./fingerprint.js";
import { getIssueSuggestions } from "../suggestions/index.js";
import type { IssueCategory, IssueSeverity, QAIssue } from "../types/issue.js";
import type { CheckResult } from "../types/result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCode(value: unknown): string {
  return String(value ?? "issue")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function titleFromCode(code: string): string {
  return code
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function inferCheckCategory(checkName: string): IssueCategory {
  const normalized = checkName.toLowerCase();

  if (normalized.includes("seo")) return "seo";
  if (normalized.includes("accessibility")) return "accessibility";
  if (normalized.includes("performance")) return "performance";
  if (normalized.includes("responsive")) return "responsive";
  if (normalized.includes("network")) return "network";
  if (normalized.includes("broken image") || normalized.includes("asset")) return "assets";
  if (normalized.includes("broken link")) return "network";
  if (normalized.includes("lighthouse")) return "lighthouse";
  if (normalized.includes("route")) return "routing";
  if (normalized.includes("build")) return "build";
  if (normalized.includes("eslint") || normalized.includes("typescript")) return "code-quality";

  return "project";
}

function severityForStatus(status: CheckResult["status"]): IssueSeverity {
  if (status === "FAIL") return "error";
  if (status === "WARNING" || status === "SKIPPED") return "warning";
  return "info";
}

function inferImageCode(record: Record<string, unknown>): string | undefined {
  if (record.alt === undefined || record.alt === "") return "missing-alt";
  if (typeof record.status === "number" && (record.status === 0 || record.status >= 400)) {
    return "broken-image";
  }
  if (typeof record.bytes === "number" && record.bytes > 1_000_000) return "large-image";
  return undefined;
}

function legacyIssueItems(result: CheckResult): unknown[] {
  const data = result.data;

  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.issues)) return data.issues;

  return Object.entries(data)
    .filter(([key]) => !["screenshots", "skippedRoutes", "grouped"].includes(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : []));
}

function issueFromItem(
  result: CheckResult,
  item: unknown,
  index: number,
): QAIssue {
  const category = result.category ?? inferCheckCategory(result.name);
  const record = isRecord(item) ? item : {};
  const code = normalizeCode(record.type ?? inferImageCode(record) ?? result.name);
  const message = String(record.message ?? result.message ?? titleFromCode(code));
  const file = typeof record.file === "string" ? record.file : undefined;
  const line = typeof record.line === "number" ? record.line : undefined;
  const column = typeof record.column === "number" ? record.column : undefined;
  const url = typeof record.url === "string" ? record.url : typeof record.route === "string" ? record.route : undefined;
  const selector = typeof record.selector === "string" ? record.selector : undefined;
  const fingerprint = createIssueFingerprint({
    category,
    code,
    file,
    line,
    url,
    selector,
  });

  return {
    id: fingerprint || `${category}:${code}:${index}`,
    code,
    category,
    severity: severityForStatus(result.status),
    status: result.status,
    title: titleFromCode(code),
    message,
    file,
    line,
    column,
    url,
    selector,
    fingerprint,
    metadata: Object.keys(record).length ? record : undefined,
    source: {
      checkName: result.name,
      raw: item,
    },
  };
}

function issueFromResultError(result: CheckResult): QAIssue | undefined {
  if (!result.error && result.status !== "SKIPPED") return undefined;

  const category = result.category ?? inferCheckCategory(result.name);
  const code = normalizeCode(result.error?.code ?? result.status.toLowerCase());
  const fingerprint = createIssueFingerprint({ category, code, url: result.name });

  return {
    id: fingerprint,
    code,
    category,
    severity: severityForStatus(result.status),
    status: result.status,
    title: titleFromCode(code),
    message: result.error?.message ?? result.message ?? "Check did not complete.",
    fingerprint,
    metadata: result.error,
    source: {
      checkName: result.name,
    },
  };
}

export function normalizeCheckResultIssues(result: CheckResult): QAIssue[] {
  if (result.issues?.length) return result.issues;
  if (result.status === "PASS") return [];

  const issues = legacyIssueItems(result).map((item, index) =>
    issueFromItem(result, item, index),
  );
  const errorIssue = issueFromResultError(result);
  const normalized = issues.length ? issues : errorIssue ? [errorIssue] : [];
  const suggestions = getIssueSuggestions(result);

  return normalized.map((issue) => ({
    ...issue,
    suggestion:
      suggestions.find((suggestion) => suggestion.code === issue.code) ??
      suggestions[0],
  }));
}

export function normalizeCheckResult(result: CheckResult): CheckResult {
  const issues = normalizeCheckResultIssues(result);

  return {
    ...result,
    category: result.category ?? inferCheckCategory(result.name),
    issues,
  };
}
