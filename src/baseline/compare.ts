import fs from "fs/promises";
import type {
  AuditReport,
  BaselineCheckComparison,
  BaselineComparison,
  CategoryScoreComparison,
  CheckResult,
  FingerprintedIssue,
  RegressionQualityGate,
} from "../types/result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getScore(result: CheckResult): number {
  if (typeof result.score === "number") return result.score;
  if (result.status === "PASS") return 100;
  if (result.status === "WARNING") return 60;
  return 0;
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

function extractIssuesFromCheck(result: CheckResult): FingerprintedIssue[] {
  const issues: FingerprintedIssue[] = [];

  const addIssue = (item: unknown, typeFallback?: string) => {
    if (!item) return;
    if (typeof item === "string") {
      const rawKey = `${result.name}|${typeFallback || ""}|${item.toLowerCase().trim()}`;
      issues.push({
        id: hashString(rawKey),
        checkName: result.name,
        type: typeFallback,
        message: item,
      });
      return;
    }

    if (isRecord(item)) {
      const message = String(
        item.message || item.type || item.rule || item.description || item.name || "Detected issue",
      );
      const route = item.route ? String(item.route) : item.url ? String(item.url) : undefined;
      const file = item.file ? String(item.file) : item.path ? String(item.path) : undefined;
      const selector = item.selector ? String(item.selector) : undefined;
      const line = typeof item.line === "number" ? item.line : undefined;
      const category = item.category ? String(item.category) : undefined;
      const type = item.type ? String(item.type) : typeFallback;

      const rawKey = [
        result.name,
        type || category || "",
        route || file || "",
        selector || "",
        line || "",
        message.toLowerCase().trim(),
      ].join("|");

      issues.push({
        id: hashString(rawKey),
        checkName: result.name,
        category,
        type,
        message,
        route,
        url: item.url ? String(item.url) : undefined,
        file,
        line,
        selector,
      });
    }
  };

  if (result.issues && Array.isArray(result.issues)) {
    for (const issue of result.issues) {
      addIssue(issue);
    }
  }

  if (result.data) {
    if (Array.isArray(result.data)) {
      for (const item of result.data) addIssue(item);
    } else if (isRecord(result.data)) {
      if (Array.isArray(result.data.issues)) {
        for (const item of result.data.issues) addIssue(item);
      }
      for (const [key, val] of Object.entries(result.data)) {
        if (["issues", "grouped", "screenshots", "skippedRoutes"].includes(key)) continue;
        if (Array.isArray(val)) {
          for (const item of val) addIssue(item, key);
        }
      }
    }
  }

  if (issues.length === 0 && (result.status === "FAIL" || result.status === "ERROR") && result.message && typeof result.score !== "number") {
    addIssue(result.message);
  }

  return issues;
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
  const checks: BaselineCheckComparison[] = current.results.map((result) => {
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

  // Extract fingerprinted issues for stable baseline tracking
  const currentIssuesMap = new Map<string, FingerprintedIssue>();
  const previousIssuesMap = new Map<string, FingerprintedIssue>();

  for (const res of current.results) {
    for (const issue of extractIssuesFromCheck(res)) {
      currentIssuesMap.set(issue.id, issue);
    }
  }

  for (const res of previous.results) {
    for (const issue of extractIssuesFromCheck(res)) {
      previousIssuesMap.set(issue.id, issue);
    }
  }

  const newIssues: FingerprintedIssue[] = [];
  const fixedIssues: FingerprintedIssue[] = [];
  const existingIssues: FingerprintedIssue[] = [];

  for (const [id, issue] of currentIssuesMap.entries()) {
    if (previousIssuesMap.has(id)) {
      existingIssues.push(issue);
    } else {
      newIssues.push(issue);
    }
  }

  for (const [id, issue] of previousIssuesMap.entries()) {
    if (!currentIssuesMap.has(id)) {
      fixedIssues.push(issue);
    }
  }

  // Detect regressed checks (where status degraded or score dropped)
  const regressedChecks: BaselineComparison["categorizedIssues"]["regressedChecks"] = [];
  for (const c of checks) {
    if (c.score.delta !== undefined && c.score.delta < 0) {
      regressedChecks.push({
        checkName: c.name,
        previousScore: c.score.previous ?? 0,
        currentScore: c.score.current,
        scoreDelta: c.score.delta,
        previousStatus: c.status.previous || "PASS",
        currentStatus: c.status.current,
      });
    } else if (c.status.previous === "PASS" && (c.status.current === "FAIL" || c.status.current === "ERROR" || c.status.current === "WARNING")) {
      regressedChecks.push({
        checkName: c.name,
        previousScore: c.score.previous ?? 0,
        currentScore: c.score.current,
        scoreDelta: c.score.delta ?? 0,
        previousStatus: c.status.previous,
        currentStatus: c.status.current,
      });
    }
  }

  // Category Score Comparison
  const categoriesToGroup: { category: string; checkNames: string[] }[] = [
    { category: "Quality", checkNames: current.results.map((r) => r.name) },
    { category: "Performance", checkNames: ["Performance", "Lighthouse"] },
    { category: "Accessibility", checkNames: ["Accessibility"] },
    { category: "SEO", checkNames: ["SEO"] },
    { category: "API & E2E", checkNames: ["REST API Testing", "E2E Flow Testing"] },
    { category: "Code & Build", checkNames: ["Build", "ESLint", "TypeScript"] },
    { category: "Responsive & UI", checkNames: ["Responsive"] },
  ];

  const categoryScores: CategoryScoreComparison[] = [];
  for (const catGroup of categoriesToGroup) {
    if (catGroup.category === "Quality") {
      const delta = current.overallScore - previous.overallScore;
      categoryScores.push({
        category: "Quality",
        currentScore: current.overallScore,
        previousScore: previous.overallScore,
        delta,
        status: delta < 0 ? "REGRESSED" : delta > 0 ? "IMPROVED" : "UNCHANGED",
      });
      continue;
    }

    const curGroupChecks = current.results.filter((r) => catGroup.checkNames.includes(r.name));
    const prevGroupChecks = previous.results.filter((r) => catGroup.checkNames.includes(r.name));

    if (curGroupChecks.length > 0 && prevGroupChecks.length > 0) {
      const curAvg = Math.round(curGroupChecks.reduce((sum, r) => sum + getScore(r), 0) / curGroupChecks.length);
      const prevAvg = Math.round(prevGroupChecks.reduce((sum, r) => sum + getScore(r), 0) / prevGroupChecks.length);
      const delta = curAvg - prevAvg;
      categoryScores.push({
        category: catGroup.category,
        currentScore: curAvg,
        previousScore: prevAvg,
        delta,
        status: delta < 0 ? "REGRESSED" : delta > 0 ? "IMPROVED" : "UNCHANGED",
      });
    }
  }

  // Quality Gate Evaluation
  const reasons: string[] = [];
  const scoreRegressed = current.overallScore < previous.overallScore;

  if (scoreRegressed) {
    reasons.push(`Overall Quality score regressed from ${previous.overallScore} to ${current.overallScore} (${current.overallScore - previous.overallScore} pts)`);
  }

  if (newIssues.length > 0) {
    reasons.push(`${newIssues.length} new issue(s) detected compared to baseline scan`);
  }

  if (regressedChecks.length > 0) {
    reasons.push(`${regressedChecks.length} check(s) regressed in score or status`);
  }

  const passed = !scoreRegressed && newIssues.length === 0 && regressedChecks.length === 0;
  if (passed) {
    reasons.push("Regression Gate Passed: No quality regressions or new issues detected.");
  }

  const qualityGate: RegressionQualityGate = {
    passed,
    scoreRegressed,
    newIssuesCount: newIssues.length,
    regressedChecksCount: regressedChecks.length,
    reasons,
  };

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
      current: currentIssuesMap.size,
      previous: previousIssuesMap.size,
      delta: currentIssuesMap.size - previousIssuesMap.size,
    },
    qualityGate,
    categoryScores,
    categorizedIssues: {
      newIssues,
      fixedIssues,
      existingIssues,
      regressedChecks,
    },
    checks,
  };
}
