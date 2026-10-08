import { BrowserCheck, issueStatus } from "./base.js";
import { stripVolatileQueryParams, toCanonicalRoute } from "../core/canonical.js";

export class NetworkCheck extends BrowserCheck {
  readonly name = "Network Errors";

  protected async evaluate(
    audit: Awaited<ReturnType<typeof this.audit>>
  ) {
    if (!audit || !audit.network) {
      return {
        status: "NOT_APPLICABLE" as const,
        score: null,
        message: "No network data collected",
        skipReason: "No browser audit data",
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const pagesAttempted = audit.seo?.length || 0;
    const pagesCompleted = audit.seo?.length || 0;

    if (pagesCompleted === 0) {
      return {
        status: "NOT_APPLICABLE" as const,
        score: null,
        message: "No pages audited for network errors",
        skipReason: "No pages audited",
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Ignore common third-party services
    const ignoredDomains = [
      "google-analytics.com",
      "googletagmanager.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "connect.facebook.net",
      "www.google.com",
      "www.googletagmanager.com",
      "doubleclick.net",
      "gstatic.com",
    ];

    const issues = audit.network.filter((issue) => {
      if (!issue.url) return true;

      return !ignoredDomains.some((domain) =>
        issue.url!.includes(domain)
      );
    });

    // Deduplicate same network failure on same route/type/target
    const seen = new Set<string>();
    const deduplicatedIssues = issues.filter((issue) => {
      const rawUrl = issue.url || issue.route || "";
      const cleanUrl = stripVolatileQueryParams(rawUrl);
      const canonicalTarget = toCanonicalRoute(cleanUrl);
      const method = (issue.method || "GET").toUpperCase();
      const route = toCanonicalRoute(issue.route || "/");
      const key = `${route}:${issue.type}:${method}:${canonicalTarget}`;
      if (seen.has(key)) return false;
      seen.add(key);
      // Clean volatile query params from issue object
      issue.url = cleanUrl;
      (issue as any).target = canonicalTarget;
      return true;
    });

    const totalObservations = deduplicatedIssues.length;

    // Calculate unique network defects after stripping RSC query tokens
    const uniqueTargets = new Set<string>();
    for (const issue of deduplicatedIssues) {
      const canonicalTarget = (issue as any).target || toCanonicalRoute(stripVolatileQueryParams(issue.url || ""));
      uniqueTargets.add(`${issue.type}:${canonicalTarget}`);
    }
    const uniqueDefectsCount = uniqueTargets.size;

    // Group by error type
    const grouped = deduplicatedIssues.reduce(
      (acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const summary = Object.entries(grouped)
      .map(([type, count]) => `• ${type}: ${count} observations`)
      .join("\n");

    const status = totalObservations === 0 ? ("PASS" as const) : ("FAIL" as const);
    const score = totalObservations === 0 ? 100 : Math.max(0, 100 - totalObservations * 20);

    return {
      status,
      score,
      message:
        totalObservations === 0
          ? `${pagesCompleted}/${pagesAttempted} pages audited — 0 network issues`
          : `${pagesCompleted}/${pagesAttempted} pages audited\n${totalObservations} network observations (${uniqueDefectsCount} unique network defects)\n${summary}`,
      pagesAttempted,
      pagesCompleted,
      data: {
        totalIssues: totalObservations,
        rawObservationsCount: totalObservations,
        uniqueDefectsCount,
        grouped,
        issues: deduplicatedIssues,
      },
    };
  }
}