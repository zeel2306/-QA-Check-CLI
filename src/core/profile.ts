import type { QaEngineOptions } from "./engine.js";

export type QaProfile = "report" | "ci" | "strict";

const profiles: Record<QaProfile, Partial<QaEngineOptions>> = {
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
  return value === "report" || value === "ci" || value === "strict";
}

export function getProfileOptions(profile?: QaProfile): Partial<QaEngineOptions> {
  return profile ? profiles[profile] : {};
}
