import fs from "fs";
import path from "path";
import type { QaEngineOptions } from "./engine.js";
import { isQaProfile } from "./profile.js";

function normalizeConfig(value: unknown): Partial<QaEngineOptions> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const config: Partial<QaEngineOptions> = {};

  if (isQaProfile(source.profile)) config.profile = source.profile;
  if (typeof source.ci === "boolean") config.ci = source.ci;
  if (typeof source.html === "boolean") config.html = source.html;
  if (typeof source.json === "boolean") config.json = source.json;
  if (typeof source.markdown === "boolean") config.markdown = source.markdown;
  if (typeof source.pdf === "boolean") config.pdf = source.pdf;
  if (typeof source.history === "boolean") config.history = source.history;
  if (typeof source.output === "string") config.output = source.output;
  if (typeof source.baseline === "string") config.baseline = source.baseline;
  if (Array.isArray(source.includeRoutes)) {
    config.includeRoutes = source.includeRoutes.filter((route): route is string => typeof route === "string");
  }
  if (Array.isArray(source.ignoreRoutes)) {
    config.ignoreRoutes = source.ignoreRoutes.filter((route): route is string => typeof route === "string");
  }
  if (typeof source.baselineComparison === "boolean") {
    config.baselineComparison = source.baselineComparison;
  }

  if (
    source.failOn === "warning" ||
    source.failOn === "error" ||
    source.failOn === "none"
  ) {
    config.failOn = source.failOn;
  }

  if (
    typeof source.minScore === "number" &&
    Number.isFinite(source.minScore) &&
    source.minScore >= 0 &&
    source.minScore <= 100
  ) {
    config.minScore = source.minScore;
  }

  if (
    typeof source.maxRoutes === "number" &&
    Number.isInteger(source.maxRoutes) &&
    source.maxRoutes > 0
  ) {
    config.maxRoutes = source.maxRoutes;
  }

  if (
    typeof source.historyLimit === "number" &&
    Number.isInteger(source.historyLimit) &&
    source.historyLimit > 0
  ) {
    config.historyLimit = source.historyLimit;
  }

  if (Array.isArray(source.api)) {
    config.apiTestCases = parseApiTestCases(source.api);
  }

  if (source.auth && typeof source.auth === "object" && typeof (source.auth as Record<string, unknown>).loginUrl === "string") {
    config.auth = source.auth as import("./auth.js").AuthConfig;
  }

  if (Array.isArray(source.flows)) {
    config.flows = source.flows.filter(
      (item): item is import("../checks/e2e.js").E2EUserFlow =>
        Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string" && Array.isArray((item as Record<string, unknown>).steps))
    );
  }

  return config;
}

export function parseApiTestCases(raw: unknown): import("../checks/api.js").ApiTestCase[] {
  if (!raw || typeof raw !== "object") return [];

  let items: unknown[] = [];
  let baseUrl = "";

  if (Array.isArray(raw)) {
    items = raw;
  } else {
    const record = raw as Record<string, unknown>;
    if (typeof record.baseUrl === "string") {
      baseUrl = record.baseUrl.trim();
    }
    if (Array.isArray(record.tests)) {
      items = record.tests;
    } else if (Array.isArray(record.api)) {
      items = record.api;
    }
  }

  const result: import("../checks/api.js").ApiTestCase[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const name = typeof rec.name === "string" ? rec.name : "Unnamed API test";
    const method = typeof rec.method === "string" ? (rec.method.toUpperCase() as any) : "GET";

    let rawUrl = typeof rec.url === "string" ? rec.url : typeof rec.path === "string" ? rec.path : "";
    if (!rawUrl) continue;

    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && baseUrl) {
      const cleanBase = baseUrl.replace(/\/$/, "");
      const cleanPath = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
      rawUrl = `${cleanBase}${cleanPath}`;
    }

    const expectedStatus = typeof rec.expectedStatus === "number" ? rec.expectedStatus : (rec.expect as any)?.status;
    const maxResponseTimeMs = typeof rec.maxResponseTimeMs === "number" ? rec.maxResponseTimeMs : (rec.expect as any)?.responseTime;
    const requiredFields = Array.isArray(rec.requiredFields)
      ? rec.requiredFields.filter((f): f is string => typeof f === "string")
      : Array.isArray((rec.expect as any)?.requiredFields)
        ? (rec.expect as any).requiredFields.filter((f: unknown): f is string => typeof f === "string")
        : undefined;

    result.push({
      name,
      method,
      url: rawUrl,
      headers: rec.headers && typeof rec.headers === "object" ? (rec.headers as Record<string, string>) : undefined,
      body: rec.body,
      expect: {
        status: expectedStatus,
        responseTime: maxResponseTimeMs,
        requiredFields,
      },
    });
  }

  return result;
}

export function loadConfig(
  projectPath: string,
): Partial<QaEngineOptions> {
  const configFile = path.join(
    projectPath,
    "qa-check.config.json",
  );

  let config: Partial<QaEngineOptions> = {};

  if (fs.existsSync(configFile)) {
    try {
      const raw = fs.readFileSync(configFile, "utf8");
      config = normalizeConfig(JSON.parse(raw));
    } catch (error) {
      console.warn(
        "Failed to read qa-check.config.json",
        error,
      );
    }
  }

  if (!config.apiTestCases || config.apiTestCases.length === 0) {
    const apiFiles = [
      "qa-api-cases.json",
      "qa-api-tests.json",
      "api-cases.json",
      "api-tests.json",
      "qa-api.json",
      "qa-check.api.json",
    ];

    for (const file of apiFiles) {
      const apiPath = path.join(projectPath, file);
      if (fs.existsSync(apiPath)) {
        try {
          const raw = fs.readFileSync(apiPath, "utf8");
          const cases = parseApiTestCases(JSON.parse(raw));
          if (cases.length > 0) {
            config.apiTestCases = cases;
            break;
          }
        } catch {
          // Ignore read/parse error
        }
      }
    }
  }

  return config;
}
