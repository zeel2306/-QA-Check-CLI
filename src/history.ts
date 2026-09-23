import fs from "fs/promises";
import path from "path";
import type { AuditReport, CheckResult, HistorySnapshot, HistoryTrend } from "./types/result.js";

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

function countByStatus(report: AuditReport): HistorySnapshot["counts"] {
  const counts = {
    pass: 0,
    warning: 0,
    fail: 0,
    error: 0,
    skipped: 0,
  };

  for (const result of report.results) {
    if (result.status === "PASS") counts.pass += 1;
    else if (result.status === "WARNING") counts.warning += 1;
    else if (result.status === "FAIL") counts.fail += 1;
    else if (result.status === "ERROR") counts.error += 1;
    else if (result.status === "SKIPPED") counts.skipped += 1;
  }

  return counts;
}

export function createHistorySnapshot(report: AuditReport): HistorySnapshot {
  return {
    version: report.version,
    projectPath: report.projectPath,
    framework: report.framework,
    pipeline: report.pipeline,
    generatedAt: report.finishedAt,
    duration: report.duration,
    overallScore: report.overallScore,
    totalIssues: report.results.reduce((total, result) => total + getIssueCount(result), 0),
    counts: countByStatus(report),
  };
}

function isHistorySnapshot(value: unknown): value is HistorySnapshot {
  return (
    isRecord(value) &&
    typeof value.generatedAt === "string" &&
    typeof value.overallScore === "number" &&
    typeof value.totalIssues === "number"
  );
}

async function readSnapshot(filePath: string): Promise<HistorySnapshot | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return isHistorySnapshot(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function readHistory(historyDir: string): Promise<HistorySnapshot[]> {
  try {
    const entries = await fs.readdir(historyDir, { withFileTypes: true });
    const snapshots = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => readSnapshot(path.join(historyDir, entry.name))),
    );

    return snapshots
      .filter((snapshot): snapshot is HistorySnapshot => Boolean(snapshot))
      .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  } catch {
    return [];
  }
}

export function createHistoryTrend(
  current: AuditReport,
  previousSnapshots: HistorySnapshot[],
  historyDir?: string,
): HistoryTrend | undefined {
  const previous = previousSnapshots.at(-1);
  const recent = [...previousSnapshots.slice(-9), createHistorySnapshot(current)];

  if (!previous && recent.length <= 1) {
    return {
      historyDir,
      runs: recent,
    };
  }

  return {
    historyDir,
    runs: recent,
    scoreDelta: previous ? current.overallScore - previous.overallScore : undefined,
    issueDelta: previous
      ? createHistorySnapshot(current).totalIssues - previous.totalIssues
      : undefined,
  };
}

export async function writeHistorySnapshot(
  report: AuditReport,
  historyDir: string,
  limit = 30,
): Promise<string> {
  await fs.mkdir(historyDir, { recursive: true });

  const snapshot = createHistorySnapshot(report);
  const safeTime = snapshot.generatedAt.replace(/[:.]/g, "-");
  const filePath = path.join(historyDir, `${safeTime}.json`);

  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  if (limit > 0) {
    const files = (await fs.readdir(historyDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
    const stale = files.slice(0, Math.max(0, files.length - limit));

    await Promise.all(stale.map((file) => fs.unlink(path.join(historyDir, file)).catch(() => undefined)));
  }

  return filePath;
}
