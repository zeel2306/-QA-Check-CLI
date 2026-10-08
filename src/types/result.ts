import type { IssueCategory, QAIssue } from "./issue.js";

export type CheckStatus = "PASS" | "FAIL" | "WARNING" | "SKIPPED" | "ERROR" | "NOT_APPLICABLE";

export interface CheckResult<T = unknown> {
  name: string;
  category?: IssueCategory;
  status: CheckStatus;
  score?: number | null;
  message?: string;
  duration: number;
  startedAt?: string;
  finishedAt?: string;
  skipReason?: string;
  errorReason?: string;
  pagesAttempted?: number;
  pagesCompleted?: number;
  pagesDiscovered?: number;
  issues?: QAIssue[];
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
  data?: T;
}

export interface Check<T = unknown> {
  name: string;
  supportedFrameworks?: readonly string[];
  run(projectPath: string): Promise<CheckResult<T>>;
}

export interface ScanCoverage {
  applicableScanners: number;
  executedSuccessfully: number;
  skipped: number;
  errors: number;
  notApplicable: number;
  coveragePercent: number;
}

export interface CurrentQualityGate {
  passed: boolean;
  status?: "PASSED" | "FAILED" | "INCOMPLETE";
  confidence?: "FULL" | "PARTIAL";
  confidencePercent?: number;
  reasons: string[];
  failingChecks: string[];
  warningChecks?: string[];
  skippedChecks?: string[];
  erroredChecks?: string[];
}

export interface AuditReport {
  version: 2;
  projectPath: string;
  framework: string;
  language?: string;
  packageManager?: string;
  buildTool?: string;
  pipeline: string;
  checksExecuted: string[];
  checksSkipped: string[];
  checksNotApplicable?: string[];
  baseUrl?: string;
  routes: string[];
  startedAt: string;
  finishedAt: string;
  duration: number;
  overallScore: number;
  coverage?: ScanCoverage;
  currentQualityGate?: CurrentQualityGate;
  rawObservations?: number;
  uniqueDefects?: number;
  canonicalDefects?: any[];
  results: CheckResult[];
  baseline?: BaselineComparison;
  history?: HistoryTrend;
}

export interface HistorySnapshot {
  version: number;
  projectPath: string;
  framework: string;
  pipeline: string;
  generatedAt: string;
  duration: number;
  overallScore: number;
  totalIssues: number;
  counts: {
    pass: number;
    warning: number;
    fail: number;
    error: number;
    skipped: number;
  };
}

export interface HistoryTrend {
  historyDir?: string;
  runs: HistorySnapshot[];
  scoreDelta?: number;
  issueDelta?: number;
}

export interface FingerprintedIssue {
  id: string;
  checkName: string;
  category?: string;
  type?: string;
  message: string;
  route?: string;
  url?: string;
  target?: string;
  method?: string;
  file?: string;
  line?: number;
  selector?: string;
}

export interface CategoryScoreComparison {
  category: string;
  currentScore: number;
  previousScore: number;
  delta: number;
  tolerance?: number;
  status: "STABLE" | "REGRESSED" | "IMPROVED";
}

export interface RegressionQualityGate {
  passed: boolean;
  scoreRegressed: boolean;
  newIssuesCount: number;
  regressedChecksCount: number;
  reasons: string[];
}

export interface ScannerExecutionChange {
  checkName: string;
  previousStatus: CheckStatus;
  currentStatus: CheckStatus;
  description: string;
}

export interface ScannerComparisonState {
  checkName: string;
  status: "STABLE" | "IMPROVED" | "REGRESSED" | "UNAVAILABLE";
  reason?: string;
  previousStatus?: CheckStatus;
  currentStatus: CheckStatus;
}

export interface CategorizedIssues {
  newIssues: FingerprintedIssue[];
  fixedIssues: FingerprintedIssue[];
  existingIssues: FingerprintedIssue[];
  regressedChecks: {
    checkName: string;
    previousScore: number;
    currentScore: number;
    scoreDelta: number;
    previousStatus: CheckStatus;
    currentStatus: CheckStatus;
  }[];
  scannerExecutionChanges?: ScannerExecutionChange[];
  scannerComparisonStates?: ScannerComparisonState[];
}

export interface MetricChangeComparison {
  name: string;
  previous: number;
  current: number;
  delta: number;
  tolerance: number;
  status: "STABLE" | "REGRESSED" | "IMPROVED";
}

export interface BaselineComparison {
  baselinePath?: string;
  currentRun: string;
  previousRun: string;
  overallScore: {
    current: number;
    previous: number;
    delta: number;
  };
  totalIssues: {
    current: number;
    previous: number;
    delta: number;
  };
  qualityGate: RegressionQualityGate;
  categoryScores: CategoryScoreComparison[];
  metricChanges?: MetricChangeComparison[];
  categorizedIssues: CategorizedIssues;
  checks: BaselineCheckComparison[];
}

export interface BaselineCheckComparison {
  name: string;
  status: {
    current: CheckStatus;
    previous?: CheckStatus;
    changed: boolean;
  };
  score: {
    current: number;
    previous?: number;
    delta?: number;
  };
  issues: {
    current: number;
    previous?: number;
    delta?: number;
  };
}

export interface BrowserIssue {
  route: string;
  viewport?: string;
  type: string;
  message: string;
  selector?: string;
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  resourceType?: string;
  reason?: string;
}
