import fs from "fs/promises";
import type { AuditReport, BaselineComparison, CheckResult } from "../types/result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getIssueCount(result: CheckResult): number {
  if (result.status === "PASS") return 0;
  const { data } = result;

  if (Array.isArray(data)) return data.length;
  if (!isRecord(data)) return 0;
  if (typeof data.totalIssues === "number") return data.totalIssues;
  if (Array.isArray(data.issues)) return data.issues.length;

  return Object.entries(data)
    .filter(([key]) => !["screenshots", "skippedRoutes", "grouped"].includes(key))
    .reduce((total, [, value]) => total + (Array.isArray(value) ? value.length : 0), 0);
}

function getScore(result: CheckResult): number {
  if (typeof result.score === "number") return result.score;
  if (result.status === "PASS") return 100;
  if (result.status === "WARNING") return 60;
  return 0;
}

export async function readBaselineReport(filePath: string): Promise<AuditReport | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuditReport>;

    if (!Array.isArray(parsed.results) || typeof parsed.overallScore !== "number") {
      return undefined;
    }

    return parsed as AuditReport;
  } catch {
    return undefined;
  }
}

export function compareWithBaseline(
  current: AuditReport,
  previous: AuditReport | undefined,
  baselinePath?: string,
): BaselineComparison | undefined {
  if (!previous) return undefined;

  const previousChecks = new Map(previous.results.map((result) => [result.name, result]));
  const checks = current.results.map((result) => {
    const previousResult = previousChecks.get(result.name);
    const currentScore = getScore(result);
    const previousScore = previousResult ? getScore(previousResult) : undefined;
    const currentIssues = getIssueCount(result);
    const previousIssues = previousResult ? getIssueCount(previousResult) : undefined;

    return {
      name: result.name,
      status: {
        current: result.status,
        previous: previousResult?.status,
        changed: previousResult ? result.status !== previousResult.status : true,
      },
      score: {
        current: currentScore,
        previous: previousScore,
        delta: previousScore === undefined ? undefined : currentScore - previousScore,
      },
      issues: {
        current: currentIssues,
        previous: previousIssues,
        delta: previousIssues === undefined ? undefined : currentIssues - previousIssues,
      },
    };
  });

  return {
    baselinePath,
    currentRun: current.finishedAt,
    previousRun: previous.finishedAt,
    overallScore: {
      current: current.overallScore,
      previous: previous.overallScore,
      delta: current.overallScore - previous.overallScore,
    },
    totalIssues: {
      current: current.results.reduce((total, result) => total + getIssueCount(result), 0),
      previous: previous.results.reduce((total, result) => total + getIssueCount(result), 0),
      delta:
        current.results.reduce((total, result) => total + getIssueCount(result), 0) -
        previous.results.reduce((total, result) => total + getIssueCount(result), 0),
    },
    checks,
  };
}
