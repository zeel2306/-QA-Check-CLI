export type CheckStatus = "PASS" | "FAIL" | "WARNING" | "SKIPPED";

export interface CheckResult<T = unknown> {
  name: string;
  status: CheckStatus;
  score?: number;
  message?: string;
  duration: number;
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
}

export interface BrowserIssue {
  route: string;
  viewport?: string;
  type: string;
  message: string;
  selector?: string;
  url?: string;
}
