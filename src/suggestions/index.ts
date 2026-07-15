import type { CheckResult } from "../types/result.js";
import { accessibilitySuggestions } from "./accessibility.js";
import { assetSuggestions } from "./assets.js";
import { consoleSuggestions } from "./console.js";
import { networkSuggestions } from "./network.js";
import { performanceSuggestions } from "./performance.js";
import { responsiveSuggestions } from "./responsive.js";
import { seoSuggestions } from "./seo.js";
import type { IssueSuggestion, SuggestionMap } from "./types.js";

export type { IssueSuggestion } from "./types.js";

const suggestions: SuggestionMap = {
  ...seoSuggestions,
  ...accessibilitySuggestions,
  ...performanceSuggestions,
  ...responsiveSuggestions,
  ...networkSuggestions,
  ...assetSuggestions,
  ...consoleSuggestions,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function titleFromCode(code: string): string {
  return code
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackSuggestion(code: string, checkName: string): IssueSuggestion {
  const normalizedCode = normalizeCode(code || checkName || "issue");

  return {
    code: normalizedCode,
    title: titleFromCode(normalizedCode),
    problem: `The ${checkName} check reported this issue.`,
    whyItMatters: "Reviewing this issue helps keep the project reliable, usable, and production-ready.",
    suggestedFix: ["Review the affected route or asset and apply the most relevant fix."],
    shortFix: "Review the affected item and apply the relevant fix.",
  };
}

function inferImageCode(item: Record<string, unknown>): string | undefined {
  if (item.alt === undefined || item.alt === "") return "missing-alt";
  if (typeof item.status === "number" && (item.status === 0 || item.status >= 400)) {
    return "broken-image";
  }
  if (typeof item.bytes === "number" && item.bytes > 1_000_000) return "large-image";
  return undefined;
}

function collectCodesFromItem(item: unknown, fallbackCode: string): string[] {
  if (!isRecord(item)) {
    return [fallbackCode];
  }

  const code =
    item.type ??
    inferImageCode(item) ??
    (typeof item.status === "number" && item.status >= 400 ? "response" : undefined) ??
    fallbackCode;

  return [normalizeCode(code)];
}

function collectCodesFromData(data: unknown, fallbackCode: string): string[] {
  if (Array.isArray(data)) {
    return data.flatMap((item) => collectCodesFromItem(item, fallbackCode));
  }

  if (!isRecord(data)) {
    return [];
  }

  const codes: string[] = [];

  if (Array.isArray(data.issues)) {
    codes.push(...data.issues.flatMap((item) => collectCodesFromItem(item, fallbackCode)));
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === "issues" || key === "screenshots" || key === "skippedRoutes" || key === "grouped") {
      continue;
    }

    if (Array.isArray(value)) {
      const collectionFallback =
        key === "broken"
          ? "broken-link"
          : key === "blockedExternal"
            ? "blocked-external"
            : fallbackCode;
      codes.push(...value.flatMap((item) => collectCodesFromItem(item, collectionFallback)));
    }
  }

  if (isRecord(data.grouped)) {
    codes.push(...Object.keys(data.grouped).map(normalizeCode));
  }

  return codes;
}

function fallbackCodeForCheck(checkName: string): string {
  const normalized = normalizeCode(checkName);

  if (normalized.includes("performance")) return "slow-page";
  if (normalized.includes("console")) return "console";
  if (normalized.includes("network")) return "requestfailed";
  if (normalized.includes("broken-images")) return "broken-image";
  if (normalized.includes("broken-links")) return "broken-link";

  return normalized;
}

export function getIssueSuggestions(result: CheckResult): IssueSuggestion[] {
  if (result.status === "PASS") {
    return [];
  }

  const fallbackCode = fallbackCodeForCheck(result.name);
  const codes = collectCodesFromData(result.data, fallbackCode);
  const uniqueCodes = [...new Set(codes.length ? codes : [fallbackCode])];

  return uniqueCodes.map((code) => suggestions[code] ?? fallbackSuggestion(code, result.name));
}

export function getShortIssueSuggestions(result: CheckResult, limit = 3): string[] {
  return getIssueSuggestions(result)
    .slice(0, limit)
    .map((suggestion) => `${suggestion.title}: ${suggestion.shortFix}`);
}
