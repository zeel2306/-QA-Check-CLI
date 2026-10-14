import type { QaEngineOptions } from "./engine.js";

export type QaProfile = "fast" | "full" | "report" | "ci" | "strict";

const profiles: Record<QaProfile, Partial<QaEngineOptions>> = {
  fast: {
    failOn: "none",
    minScore: 0,
  },
  full: {
    failOn: "error",
    minScore: 0,
  },
  report: {
    failOn: "none",
    minScore: 0,
  },
  ci: {
    ci: true,
    failOn: "error",
    minScore: 0,
  },
  strict: {
    ci: true,
    failOn: "warning",
    minScore: 80,
  },
};

export function isQaProfile(value: unknown): value is QaProfile {
  return value === "fast" || value === "full" || value === "report" || value === "ci" || value === "strict";
}

export function getProfileOptions(profile?: QaProfile): Partial<QaEngineOptions> {
  return profile ? profiles[profile] : {};
}
