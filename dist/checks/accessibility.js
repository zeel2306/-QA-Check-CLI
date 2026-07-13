import { BrowserCheck, issueStatus } from "./base.js";
export class AccessibilityCheck extends BrowserCheck {
    name = "Accessibility";
    async evaluate(audit) {
        const inspectedPages = Math.max(audit.seo.length, 1);
        const score = Math.max(0, Math.round(100 - (audit.accessibility.length / inspectedPages) * 2));
        // Group violations by type
        const grouped = audit.accessibility.reduce((acc, issue) => {
            acc[issue.type] = (acc[issue.type] || 0) + 1;
            return acc;
        }, {});
        // Create readable summary
        const summary = Object.entries(grouped)
            .map(([type, count]) => `• ${type}: ${count}`)
            .join("\n");
        return {
            status: issueStatus(audit.accessibility.length),
            score,
            message: audit.accessibility.length === 0
                ? "No accessibility issues found"
                : summary,
            data: {
                totalIssues: audit.accessibility.length,
                grouped,
                issues: audit.accessibility,
            },
        };
    }
}
