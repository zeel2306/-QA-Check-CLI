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

  return config;
}

export function loadConfig(
  projectPath: string,
): Partial<QaEngineOptions> {
  const configFile = path.join(
    projectPath,
    "qa-check.config.json",
  );

  if (!fs.existsSync(configFile)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configFile, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.warn(
      "Failed to read qa-check.config.json",
      error,
    );

    return {};
  }
}
