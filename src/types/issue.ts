import type { CheckStatus } from "./result.js";
import type { IssueSuggestion } from "../suggestions/types.js";

export type IssueCategory =
  | "build"
  | "code-quality"
  | "seo"
  | "accessibility"
  | "performance"
  | "responsive"
  | "network"
  | "assets"
  | "routing"
  | "lighthouse"
  | "project"
  | "unknown";

export type IssueSeverity = "info" | "warning" | "error";

export interface QAIssue {
  id: string;
  code: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: CheckStatus | "ERROR";
  title: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  url?: string;
  selector?: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
  source: {
    checkName: string;
    raw?: unknown;
  };
  suggestion?: IssueSuggestion;
}
