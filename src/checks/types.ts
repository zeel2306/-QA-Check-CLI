import type { QAContext } from "../core/context.js";
import type { IssueCategory } from "../types/issue.js";
import type { CheckResult } from "../types/result.js";

export interface QACheck<T = unknown> {
  name: string;
  category: IssueCategory;
  description?: string;
  timeoutMs?: number;
  run(context: QAContext): Promise<CheckResult<T>> | CheckResult<T>;
}
