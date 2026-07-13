import { BrowserCheck, issueStatus } from "./base.js";

export class ResponsiveCheck extends BrowserCheck {
  readonly name = "Responsive";

  protected async evaluate(
    audit: Awaited<ReturnType<typeof this.audit>>
  ) {
    // Group issues by type
    const grouped = audit.responsive.reduce(
      (acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Create a readable summary
    const summary = Object.entries(grouped)
      .map(([type, count]) => `• ${type}: ${count}`)
      .join("\n");

    return {
      status: issueStatus(audit.responsive.length),

      message:
        audit.responsive.length === 0
          ? "No responsive issues found"
          : summary,

      data: {
        totalIssues: audit.responsive.length,
        grouped,
        issues: audit.responsive,
        screenshots: audit.screenshots,
        skippedRoutes: audit.skippedRoutes,
      },
    };
  }
}