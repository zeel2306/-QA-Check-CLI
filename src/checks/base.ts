import type { BrowserAudit } from "../core/browser.js";
import type { Check, CheckResult, CheckStatus } from "../types/result.js";

export type AuditProvider = () => Promise<BrowserAudit>;

export abstract class BrowserCheck<T = unknown> implements Check<T> {
  abstract readonly name: string;
  constructor(protected readonly audit: AuditProvider) {}
  protected abstract evaluate(audit: BrowserAudit): Omit<CheckResult<T>, "name" | "duration"> | Promise<Omit<CheckResult<T>, "name" | "duration">>;
  async run(_projectPath: string): Promise<CheckResult<T>> {
    const started = performance.now();
    try {
      return { name: this.name, ...await this.evaluate(await this.audit()), duration: performance.now() - started };
    } catch (error) {
      return { name: this.name, status: "SKIPPED", message: error instanceof Error ? error.message : String(error), duration: performance.now() - started };
    }
  }
}

export function issueStatus(count: number): CheckStatus {
  return count === 0 ? "PASS" : "FAIL";
}

export function scoreFromIssues(issues: number, inspected: number): number {
  return inspected === 0 ? 0 : Math.max(0, Math.round(100 - (issues / inspected) * 20));
}

export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  }));
  return results;
}
