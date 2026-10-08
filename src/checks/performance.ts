import { BrowserCheck } from "./base.js";

export class PerformanceCheck extends BrowserCheck {
  readonly name = "Performance";
  protected async evaluate(audit: Awaited<ReturnType<typeof this.audit>>) {
    if (!audit || !audit.performance || audit.performance.length === 0) {
      return {
        status: "NOT_APPLICABLE" as const,
        score: null,
        message: "No performance timing measurements collected",
        skipReason: "No performance data available",
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const pagesAttempted = audit.seo?.length || audit.performance.length;
    const pagesCompleted = audit.performance.length;

    const slow = audit.performance.filter((item) => item.load > 3000 || item.ttfb > 800);
    const score = Math.max(0, Math.round(100 - (slow.length / audit.performance.length) * 50));
    const status = slow.length ? ("WARNING" as const) : ("PASS" as const);
    const message = slow.length
      ? `${slow.length} slow page(s) exceeded performance thresholds (>3000ms load, >800ms TTFB)`
      : `All ${audit.performance.length} page(s) within performance thresholds (<3000ms load, <800ms TTFB)`;

    return {
      status,
      score,
      message,
      pagesAttempted,
      pagesCompleted,
      data: {
        measurementsCount: audit.performance.length,
        slowPagesCount: slow.length,
        thresholds: { maxLoadMs: 3000, maxTtfbMs: 800 },
        measurements: audit.performance,
      },
    };
  }
}
