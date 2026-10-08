import type { CheckResult } from "../types/result.js";
import { accessibilitySuggestions } from "./accessibility.js";
import { assetSuggestions } from "./assets.js";
import { codeQualitySuggestions } from "./codeQuality.js";
import { consoleSuggestions } from "./console.js";
import { linkSuggestions } from "./links.js";
import { networkSuggestions } from "./network.js";
import { performanceSuggestions } from "./performance.js";
import { responsiveSuggestions } from "./responsive.js";
import { seoSuggestions } from "./seo.js";
import { eslintSuggestions } from "./eslint.js";
import { apiSuggestions } from "./api.js";
import type { IssueSuggestion, SuggestionMap } from "./types.js";

export type { IssueSuggestion } from "./types.js";

const suggestions: SuggestionMap = {
  ...codeQualitySuggestions,
  ...seoSuggestions,
  ...accessibilitySuggestions,
  ...performanceSuggestions,
  ...responsiveSuggestions,
  ...networkSuggestions,
  ...assetSuggestions,
  ...linkSuggestions,
  ...consoleSuggestions,
  ...eslintSuggestions,
  ...apiSuggestions,
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

function collectCodesFromItem(item: unknown, fallbackCode: string): string[] {
  if (!isRecord(item)) {
    return [fallbackCode];
  }

  // Handle ApiTestResultItem
  if (typeof item.expectedStatus === "number" || typeof item.responseTime === "number") {
    if (item.status !== "FAIL") return [];
    const apiCodes: string[] = [];
    if (typeof item.httpStatus === "number" && typeof item.expectedStatus === "number" && item.httpStatus !== item.expectedStatus) {
      apiCodes.push("api-status-mismatch");
    }
    if (Array.isArray(item.missingFields) && item.missingFields.length > 0) {
      apiCodes.push("api-missing-fields");
    }
    if (typeof item.expectedResponseTime === "number" && typeof item.responseTime === "number" && item.responseTime > item.expectedResponseTime) {
      apiCodes.push("api-slow-response");
    }
    if (typeof item.message === "string" && item.message.includes("not valid JSON")) {
      apiCodes.push("api-invalid-json");
    }
    return apiCodes.length > 0 ? apiCodes : ["api-status-mismatch"];
  }

  const rawCode =
    item.ruleId ??
    item.type ??
    item.code ??
    (typeof item.status === "number" && item.status >= 400 ? "response" : undefined) ??
    fallbackCode;

  const raw = String(rawCode).trim();
  const normalized = normalizeCode(raw);

  return [raw, normalized, `eslint:${raw}`, `eslint:${normalized}`];
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

  if (Array.isArray(data.results)) {
    codes.push(...data.results.flatMap((item) => collectCodesFromItem(item, fallbackCode)));
  }

  for (const [key, value] of Object.entries(data)) {
    if (
      key === "issues" ||
      key === "results" ||
      key === "screenshots" ||
      key === "skippedRoutes" ||
      key === "grouped" ||
      key === "testedEndpoints" ||
      key === "testedEndpointsCount"
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      const collectionFallback =
        key === "broken"
          ? "broken-internal-link"
          : key === "missingAssets"
            ? "missing-image-asset"
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
  if (normalized.includes("broken-images")) return "missing-image-asset";
  if (normalized.includes("broken-links")) return "broken-internal-link";
  if (normalized.includes("api")) return "api-status-mismatch";

  return normalized;
}

export function getIssueSuggestions(result: CheckResult): IssueSuggestion[] {
  if (result.status === "PASS" || result.status === "NOT_APPLICABLE" || result.status === "SKIPPED") {
    return [];
  }

  const fallbackCode = fallbackCodeForCheck(result.name);
  const rawCodes: string[] = [];

  if (Array.isArray(result.issues) && result.issues.length > 0) {
    for (const item of result.issues) {
      rawCodes.push(...collectCodesFromItem(item, fallbackCode));
    }
  }

  if (rawCodes.length === 0 && result.data) {
    rawCodes.push(...collectCodesFromData(result.data, fallbackCode));
  }

  const matched: IssueSuggestion[] = [];
  const seenTitles = new Set<string>();

  for (const code of rawCodes) {
    if (!code) continue;
    const s = suggestions[code] ?? suggestions[normalizeCode(code)];
    if (s && !seenTitles.has(s.title)) {
      seenTitles.add(s.title);
      matched.push(s);
    }
  }

  if (matched.length > 0) {
    return matched;
  }

  const fallback = suggestions[fallbackCode] ?? fallbackSuggestion(fallbackCode, result.name);
  return [fallback];
}

export function getShortIssueSuggestions(result: CheckResult, limit = 3): string[] {
  return getIssueSuggestions(result)
    .slice(0, limit)
    .map((suggestion) => `${suggestion.title}: ${suggestion.shortFix}`);
}
