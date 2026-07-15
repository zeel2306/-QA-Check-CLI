import type { AuditReport } from "../types/result.js";

export function getExitCode(
  report: AuditReport,
  failOn: "warning" | "error" = "error",
): number {
  const hasFail = report.results.some(
    (result) => result.status === "FAIL",
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