import type { AuditReport } from "../types/result.js";

export function getExitCode(
  report: AuditReport,
  failOn: "warning" | "error" | "none" = "error",
  minScore = 0,
): number {
  if (minScore > 0 && report.overallScore < minScore) {
    return 3;
  }

  if (failOn === "none") {
    return 0;
  }

  const hasFail = report.results.some(
    (result) => result.status === "FAIL" || result.status === "ERROR",
  );

  const hasWarning = report.results.some(
    (result) => result.status === "WARNING",
  );

  if (hasFail) {
    return 2;
  }

  if (failOn === "warning" && hasWarning) {
    return 1;
  }

  return 0;
}
