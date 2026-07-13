import { BrowserCheck, scoreFromIssues } from "./base.js";
export class SeoCheck extends BrowserCheck {
    name = "SEO";
    async evaluate(audit) {
        const issues = [];
        const titles = new Map();
        const descriptions = new Map();
        for (const page of audit.seo) {
            const add = (type, message) => issues.push({ route: page.route, type, message });
            if (!page.title)
                add("missing-title", "Missing document title");
            if (!page.description)
                add("missing-description", "Missing meta description");
            if (!page.canonical)
                add("missing-canonical", "Missing canonical URL");
            if (!page.hasOpenGraph)
                add("missing-open-graph", "Missing Open Graph metadata");
            if (!page.hasTwitterCard)
                add("missing-twitter-card", "Missing Twitter Card metadata");
            if (page.h1Count === 0)
                add("missing-h1", "Missing H1");
            if (page.h1Count > 1)
                add("multiple-h1", `Found ${page.h1Count} H1 elements`);
            if (page.missingAlt)
                add("missing-alt", `${page.missingAlt} images are missing alt text`);
            if (!page.hasStructuredData)
                add("missing-structured-data", "Missing structured data");
            if (page.title)
                titles.set(page.title, [...(titles.get(page.title) ?? []), page.route]);
            if (page.description)
                descriptions.set(page.description, [
                    ...(descriptions.get(page.description) ?? []),
                    page.route,
                ]);
        }
        for (const [title, routes] of titles)
            if (routes.length > 1)
                issues.push({
                    route: routes.join(", "),
                    type: "duplicate-title",
                    message: `Duplicate title: ${title}`,
                });
        for (const [description, routes] of descriptions)
            if (routes.length > 1)
                issues.push({
                    route: routes.join(", "),
                    type: "duplicate-description",
                    message: `Duplicate description: ${description}`,
                });
        for (const endpoint of ["/robots.txt", "/sitemap.xml"]) {
            try {
                const response = await fetch(new URL(endpoint, audit.baseUrl), {
                    signal: AbortSignal.timeout(5_000),
                });
                if (!response.ok)
                    issues.push({
                        route: endpoint,
                        type: "missing-seo-file",
                        message: `${endpoint} returned HTTP ${response.status}`,
                    });
            }
            catch {
                issues.push({
                    route: endpoint,
                    type: "missing-seo-file",
                    message: `${endpoint} is unavailable`,
                });
            }
        }
        for (const page of audit.seo.filter((item) => item.canonical)) {
            try {
                const response = await fetch(page.canonical, {
                    method: "HEAD",
                    signal: AbortSignal.timeout(5_000),
                });
                if (!response.ok)
                    issues.push({
                        route: page.route,
                        type: "broken-canonical",
                        message: `Canonical returned HTTP ${response.status}`,
                        url: page.canonical,
                    });
            }
            catch {
                issues.push({
                    route: page.route,
                    type: "broken-canonical",
                    message: "Canonical URL is unavailable",
                    url: page.canonical,
                });
            }
        }
        const score = scoreFromIssues(issues.length, audit.seo.length);
        const status = score >= 90
            ? "PASS"
            : score >= 70
                ? "WARNING"
                : "FAIL";
        // Group issues by type
        const grouped = issues.reduce((acc, issue) => {
            acc[issue.type] = (acc[issue.type] || 0) + 1;
            return acc;
        }, {});
        // Create readable summary
        const summary = Object.entries(grouped)
            .map(([type, count]) => `• ${type}: ${count}`)
            .join("\n");
        return {
            status,
            score,
            message: issues.length === 0 ? "No SEO issues found" : summary,
            data: {
                totalIssues: issues.length,
                grouped,
                issues,
            },
        };
    }
}
