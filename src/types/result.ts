import type { IssueCategory, QAIssue } from "./issue.js";

export type CheckStatus = "PASS" | "FAIL" | "WARNING" | "SKIPPED" | "ERROR";

export interface CheckResult<T = unknown> {
  name: string;
  category?: IssueCategory;
  status: CheckStatus;
  score?: number;
  message?: string;
  duration: number;
  startedAt?: string;
  finishedAt?: string;
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
  baseUrl?: string;
  routes: string[];
  startedAt: string;
  finishedAt: string;
  duration: number;
  overallScore: number;
  results: CheckResult[];
  baseline?: BaselineComparison;
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
}
