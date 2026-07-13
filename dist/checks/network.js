import { BrowserCheck, issueStatus } from "./base.js";
export class NetworkCheck extends BrowserCheck {
    name = "Network Errors";
    async evaluate(audit) {
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
            if (!issue.url)
                return true;
            return !ignoredDomains.some((domain) => issue.url.includes(domain));
        });
        // Group by error type
        const grouped = issues.reduce((acc, issue) => {
            acc[issue.type] = (acc[issue.type] || 0) + 1;
            return acc;
        }, {});
        const summary = Object.entries(grouped)
            .map(([type, count]) => `• ${type}: ${count}`)
            .join("\n");
        return {
            status: issueStatus(issues.length),
            message: issues.length === 0
                ? "No network issues found"
                : summary,
            data: {
                totalIssues: issues.length,
                grouped,
                issues,
            },
        };
    }
}
