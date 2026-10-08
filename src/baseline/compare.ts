import fs from "fs/promises";
import { stripVolatileQueryParams } from "../core/canonical.js";
import type {
  AuditReport,
  BaselineCheckComparison,
  BaselineComparison,
  CategoryScoreComparison,
  CheckResult,
  FingerprintedIssue,
  MetricChangeComparison,
  RegressionQualityGate,
  ScannerComparisonState,
  ScannerExecutionChange,
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

export function isScannerComparable(result: CheckResult | undefined): boolean {
  if (!result) return false;
  return result.status === "PASS" || result.status === "WARNING" || result.status === "FAIL";
}

function normalizePathOrUrl(input?: string): string {
  if (!input) return "";
  let norm = String(input).trim();
  norm = stripVolatileQueryParams(norm);
  norm = norm.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i, "");
  norm = norm.replace(/\\/g, "/");
  if (norm === "index.html" || norm === "./index.html" || norm === "/index.html") {
    return "/";
  }
  if (norm.startsWith("./")) {
    norm = norm.slice(1);
  }
  norm = norm.replace(/\/{2,}/g, "/");
  return norm;
}

export function buildNormalizedFingerprint(
  checkName: string,
  item: unknown,
  typeFallback?: string,
): { id: string; issue: FingerprintedIssue } | null {
  if (!item) return null;

  if (typeof item === "string") {
    const cleanMsg = stripVolatileQueryParams(item.trim());
    const id = hashString(`${checkName}|${typeFallback || ""}|${cleanMsg.toLowerCase()}`);
    return {
      id,
      issue: {
        id,
        checkName,
        type: typeFallback,
        message: cleanMsg,
      },
    };
  }

  if (isRecord(item)) {
    const rawType = String(item.type || item.code || item.rule || item.ruleId || typeFallback || "issue");
    const rawMsg = String(item.message || item.reason || item.description || item.name || rawType);
    const rawRoute = item.route ? String(item.route) : item.url ? String(item.url) : undefined;
    const rawFile = item.file ? String(item.file) : item.path ? String(item.path) : undefined;
    const rawSelector = item.selector ? String(item.selector) : undefined;
    const line = typeof item.line === "number" ? item.line : undefined;
    const category = item.category ? String(item.category) : undefined;

    const canonicalRoute = normalizePathOrUrl(rawRoute || rawFile);
    const rawTarget = item.target
      ? String(item.target)
      : item.url
        ? String(item.url)
        : item.file
          ? String(item.file)
          : item.path
            ? String(item.path)
            : rawSelector;
    const canonicalTarget = normalizePathOrUrl(rawTarget);
    const method = item.method ? String(item.method).toUpperCase() : undefined;

    const signature = [
      checkName,
      rawType,
      canonicalRoute,
      method || "",
      canonicalTarget,
      line || "",
    ].join("|");

    const id = hashString(signature);

    return {
      id,
      issue: {
        id,
        checkName,
        category,
        type: rawType,
        message: rawMsg,
        route: canonicalRoute || (rawRoute ? normalizePathOrUrl(rawRoute) : undefined),
        target: canonicalTarget || undefined,
        url: item.url ? stripVolatileQueryParams(String(item.url)) : undefined,
        method,
        file: rawFile,
        line,
        selector: rawSelector,
      },
    };
  }

  return null;
}

function extractIssuesFromCheck(result: CheckResult): FingerprintedIssue[] {
  if (result.name.startsWith("Lighthouse") || result.name === "Performance") {
    return [];
  }

  const issues: FingerprintedIssue[] = [];

  const addIssue = (item: unknown, typeFallback?: string) => {
    const fp = buildNormalizedFingerprint(result.name, item, typeFallback);
    if (fp) {
      issues.push(fp.issue);
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
      if (Array.isArray(result.data.issues) && result.data.issues.length > 0) {
        for (const item of result.data.issues) addIssue(item);
      } else {
        for (const [key, val] of Object.entries(result.data)) {
          if (["issues", "grouped", "screenshots", "skippedRoutes", "measurements"].includes(key)) continue;
          if (Array.isArray(val)) {
            for (const item of val) addIssue(item, key);
          }
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

  if (previous.version && current.version && previous.version !== current.version) {
    return {
      baselinePath,
      currentRun: current.finishedAt,
      previousRun: previous.finishedAt,
      overallScore: { current: current.overallScore, previous: previous.overallScore, delta: current.overallScore - previous.overallScore },
      totalIssues: { current: 0, previous: 0, delta: 0 },
      qualityGate: {
        passed: false,
        scoreRegressed: false,
        newIssuesCount: 0,
        regressedChecksCount: 0,
        reasons: [`Baseline comparison unavailable: baseline schema (v${previous.version}) is incompatible with current report schema (v${current.version}).`],
      },
      categoryScores: [],
      metricChanges: [],
      categorizedIssues: {
        newIssues: [],
        fixedIssues: [],
        existingIssues: [],
        regressedChecks: [],
        scannerComparisonStates: [
          { checkName: "All Scanners", status: "UNAVAILABLE", reason: `Incompatible baseline schema version (v${previous.version} vs v${current.version})`, currentStatus: "SKIPPED" },
        ],
      },
      checks: [],
    };
  }

  const previousChecks = new Map(previous.results.map((result) => [result.name, result]));
  const currentChecks = new Map(current.results.map((result) => [result.name, result]));
  const allScannerNames = new Set([...previousChecks.keys(), ...currentChecks.keys()]);

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

  const currentIssuesMap = new Map<string, FingerprintedIssue>();
  const previousIssuesMap = new Map<string, FingerprintedIssue>();

  const scannerExecutionChanges: ScannerExecutionChange[] = [];
  const scannerComparisonStates: ScannerComparisonState[] = [];
  const regressedChecks: BaselineComparison["categorizedIssues"]["regressedChecks"] = [];

  for (const name of allScannerNames) {
    const curRes = currentChecks.get(name);
    const prevRes = previousChecks.get(name);

    if (curRes?.status === "NOT_APPLICABLE" || prevRes?.status === "NOT_APPLICABLE") {
      continue;
    }

    const prevComp = isScannerComparable(prevRes);
    const curComp = isScannerComparable(curRes);

    if (prevRes && curRes && prevRes.status !== curRes.status) {
      if (!prevComp || !curComp) {
        scannerExecutionChanges.push({
          checkName: name,
          previousStatus: prevRes.status,
          currentStatus: curRes.status,
          description: `${name}: Scanner status changed from ${prevRes.status} to ${curRes.status} (Infrastructure/execution state change).`,
        });
      }
    }

    if (!prevComp || !curComp) {
      let reason = "";
      if (!prevRes) {
        reason = `Previous ${name} scan result was missing.`;
      } else if (!prevComp) {
        reason = `Previous ${name} scan did not complete successfully (status: ${prevRes.status}).`;
      } else if (!curRes) {
        reason = `Current ${name} scan result was missing.`;
      } else {
        reason = `Current ${name} scan did not complete successfully (status: ${curRes.status}).`;
      }

      scannerComparisonStates.push({
        checkName: name,
        status: "UNAVAILABLE",
        reason,
        previousStatus: prevRes?.status,
        currentStatus: curRes?.status || "SKIPPED",
      });
      continue;
    }

    // Both baseline and current are comparable!
    if (curRes && prevRes) {
      for (const issue of extractIssuesFromCheck(curRes)) {
        currentIssuesMap.set(issue.id, issue);
      }
      for (const issue of extractIssuesFromCheck(prevRes)) {
        previousIssuesMap.set(issue.id, issue);
      }

      // Check status transition
      if ((prevRes.status === "PASS" || prevRes.status === "WARNING") && curRes.status === "FAIL") {
        regressedChecks.push({
          checkName: name,
          previousScore: getScore(prevRes),
          currentScore: getScore(curRes),
          scoreDelta: getScore(curRes) - getScore(prevRes),
          previousStatus: prevRes.status,
          currentStatus: curRes.status,
        });
        scannerComparisonStates.push({
          checkName: name,
          status: "REGRESSED",
          previousStatus: prevRes.status,
          currentStatus: curRes.status,
        });
      } else if (prevRes.status === "FAIL" && curRes.status === "PASS") {
        scannerComparisonStates.push({
          checkName: name,
          status: "IMPROVED",
          previousStatus: prevRes.status,
          currentStatus: curRes.status,
        });
      } else {
        scannerComparisonStates.push({
          checkName: name,
          status: "STABLE",
          previousStatus: prevRes.status,
          currentStatus: curRes.status,
        });
      }
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

  // Metric Changes (Lighthouse & Performance)
  const defaultLighthouseTolerance = 5;
  const metricChanges: MetricChangeComparison[] = [];

  const curLighthouse = current.results.find((r) => r.name.startsWith("Lighthouse"));
  const prevLighthouse = previous.results.find((r) => r.name.startsWith("Lighthouse"));

  const curCategoryScores = (curLighthouse?.metadata?.categoryScores as Record<string, number> | undefined) || {};
  const prevCategoryScores = (prevLighthouse?.metadata?.categoryScores as Record<string, number> | undefined) || {};

  const lighthouseMetrics: Array<{ key: string; name: string }> = [
    { key: "performance", name: "Lighthouse Performance" },
    { key: "accessibility", name: "Lighthouse Accessibility" },
    { key: "bestPractices", name: "Lighthouse Best Practices" },
    { key: "seo", name: "Lighthouse SEO" },
  ];

  for (const { key, name } of lighthouseMetrics) {
    const cur = curCategoryScores[key] ?? (key === "performance" ? curLighthouse?.score ?? undefined : undefined);
    const prev = prevCategoryScores[key] ?? (key === "performance" ? prevLighthouse?.score ?? undefined : undefined);

    if (typeof cur === "number" && typeof prev === "number") {
      const delta = cur - prev;
      let status: "STABLE" | "REGRESSED" | "IMPROVED" = "STABLE";
      if (delta < -defaultLighthouseTolerance) {
        status = "REGRESSED";
      } else if (delta > defaultLighthouseTolerance) {
        status = "IMPROVED";
      }

      metricChanges.push({
        name,
        previous: prev,
        current: cur,
        delta,
        tolerance: defaultLighthouseTolerance,
        status,
      });
    }
  }

  // Performance timings metric changes
  const curPerf = current.results.find((r) => r.name === "Performance");
  const prevPerf = previous.results.find((r) => r.name === "Performance");
  if (curPerf && prevPerf && isRecord(curPerf.data) && isRecord(prevPerf.data)) {
    const curMeas = Array.isArray(curPerf.data.measurements) ? curPerf.data.measurements : [];
    const prevMeas = Array.isArray(prevPerf.data.measurements) ? prevPerf.data.measurements : [];
    const prevMap = new Map<string, { route: string; load: number; ttfb: number }>(
      prevMeas.map((m: any) => [m.route, m]),
    );

    for (const curItem of curMeas as any[]) {
      const prevItem = prevMap.get(curItem.route);
      if (prevItem && typeof curItem.load === "number" && typeof prevItem.load === "number") {
        const delta = Math.round(curItem.load - prevItem.load);
        const absoluteTolerance = 500;
        const pctChange = prevItem.load > 0 ? (delta / prevItem.load) * 100 : 0;
        let status: "STABLE" | "REGRESSED" | "IMPROVED" = "STABLE";

        if ((delta > absoluteTolerance && pctChange > 50) || delta > 1500) {
          status = "REGRESSED";
        } else if ((delta < -absoluteTolerance && pctChange < -50) || delta < -1500) {
          status = "IMPROVED";
        } else {
          status = "STABLE";
        }

        metricChanges.push({
          name: `Performance Load (${curItem.route})`,
          previous: Math.round(prevItem.load),
          current: Math.round(curItem.load),
          delta,
          tolerance: absoluteTolerance,
          status,
        });
      }
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

  const AGGREGATE_SCORE_TOLERANCE = 2;

  const categoryScores: CategoryScoreComparison[] = [];
  for (const catGroup of categoriesToGroup) {
    let currentScore = 0;
    let previousScore = 0;
    let delta = 0;

    if (catGroup.category === "Quality") {
      currentScore = current.overallScore;
      previousScore = previous.overallScore;
      delta = currentScore - previousScore;
    } else {
      const curGroupChecks = current.results.filter((r) => catGroup.checkNames.includes(r.name));
      const prevGroupChecks = previous.results.filter((r) => catGroup.checkNames.includes(r.name));

      if (curGroupChecks.length === 0 || prevGroupChecks.length === 0) continue;

      currentScore = Math.round(curGroupChecks.reduce((sum, r) => sum + getScore(r), 0) / curGroupChecks.length);
      previousScore = Math.round(prevGroupChecks.reduce((sum, r) => sum + getScore(r), 0) / prevGroupChecks.length);
      delta = currentScore - previousScore;
    }

    let status: "STABLE" | "IMPROVED" | "REGRESSED" = "STABLE";
    if (delta > 0) {
      status = "IMPROVED";
    } else if (delta < -AGGREGATE_SCORE_TOLERANCE) {
      status = "REGRESSED";
    } else {
      status = "STABLE";
    }

    categoryScores.push({
      category: catGroup.category,
      currentScore,
      previousScore,
      delta,
      tolerance: AGGREGATE_SCORE_TOLERANCE,
      status,
    });
  }

  // Quality Gate Evaluation
  const reasons: string[] = [];
  const regressedMetrics = metricChanges.filter((m) => m.status === "REGRESSED");
  const regressedCategories = categoryScores.filter((c) => c.status === "REGRESSED");
  const overallDelta = current.overallScore - previous.overallScore;
  const scoreRegressed = regressedMetrics.length > 0 || regressedCategories.length > 0 || (overallDelta < -AGGREGATE_SCORE_TOLERANCE && regressedChecks.length > 0);

  if (scoreRegressed) {
    reasons.push(`Overall Quality score regressed from ${previous.overallScore} to ${current.overallScore} (${current.overallScore - previous.overallScore} pts)`);
  }

  if (newIssues.length > 0) {
    reasons.push(`${newIssues.length} new issue(s) detected compared to baseline scan`);
  }

  if (regressedChecks.length > 0) {
    reasons.push(`${regressedChecks.length} check(s) regressed in score or status (${regressedChecks.map((c) => c.checkName).join(", ")})`);
  }

  if (regressedMetrics.length > 0) {
    reasons.push(`${regressedMetrics.length} metric(s) regressed beyond tolerance (${regressedMetrics.map((m) => m.name).join(", ")})`);
  }

  const passed = !scoreRegressed && newIssues.length === 0 && regressedChecks.length === 0 && regressedMetrics.length === 0;
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
    metricChanges,
    categorizedIssues: {
      newIssues,
      fixedIssues,
      existingIssues,
      regressedChecks,
      scannerExecutionChanges,
      scannerComparisonStates,
    },
    checks,
  };
}
