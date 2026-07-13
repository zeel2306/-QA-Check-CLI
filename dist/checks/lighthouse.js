import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
function concreteRoutes(routes) {
    return routes.filter((route) => !/[\[\]:*]/.test(route));
}
function score(value) {
    return Math.round((value ?? 0) * 100);
}
function getAuditRoutes(routes, fullAudit = false) {
    const pages = concreteRoutes(routes);
    if (fullAudit) {
        return pages;
    }
    const selected = [];
    const seen = new Set();
    for (const route of pages) {
        const key = route === "/" ? "/" : route.split("/")[1] || "/";
        if (!seen.has(key)) {
            seen.add(key);
            selected.push(route);
        }
    }
    return selected;
}
export class LighthouseCheck {
    baseUrl;
    routes;
    fullAudit;
    name = "Lighthouse";
    constructor(baseUrl, routes, fullAudit = false) {
        this.baseUrl = baseUrl;
        this.routes = routes;
        this.fullAudit = fullAudit;
    }
    async run(_projectPath) {
        const started = performance.now();
        let chrome;
        try {
            chrome = await launch({
                chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
            });
            const pages = [];
            const skipped = [];
            for (const route of getAuditRoutes(this.routes, this.fullAudit)) {
                try {
                    const result = await lighthouse(new URL(route, this.baseUrl).href, {
                        port: chrome.port,
                        output: "json",
                        logLevel: "error",
                        onlyCategories: [
                            "performance",
                            "accessibility",
                            "seo",
                            "best-practices",
                        ],
                    });
                    if (!result)
                        continue;
                    const audits = result.lhr.audits;
                    pages.push({
                        route,
                        performance: score(result.lhr.categories.performance?.score),
                        accessibility: score(result.lhr.categories.accessibility?.score),
                        seo: score(result.lhr.categories.seo?.score),
                        bestPractices: score(result.lhr.categories["best-practices"]?.score),
                        metrics: {
                            CLS: audits["cumulative-layout-shift"]?.numericValue,
                            LCP: audits["largest-contentful-paint"]?.numericValue,
                            FCP: audits["first-contentful-paint"]?.numericValue,
                            INP: audits["interaction-to-next-paint"]?.numericValue,
                            TTFB: audits["server-response-time"]?.numericValue,
                        },
                    });
                }
                catch {
                    skipped.push(route);
                }
            }
            if (skipped.length) {
                console.log(`⚠ Lighthouse skipped ${skipped.length} page(s)`);
            }
            const overall = pages.length
                ? Math.round(pages.reduce((sum, page) => sum + page.performance, 0) /
                    pages.length)
                : 0;
            return {
                name: this.name,
                status: overall >= 90 ? "PASS" : overall >= 50 ? "WARNING" : "FAIL",
                score: overall,
                message: `${pages.length} pages audited`,
                duration: performance.now() - started,
                data: pages,
            };
        }
        catch (error) {
            return {
                name: this.name,
                status: "SKIPPED",
                message: error instanceof Error ? error.message : String(error),
                duration: performance.now() - started,
            };
        }
        finally {
            await chrome?.kill();
        }
    }
}
