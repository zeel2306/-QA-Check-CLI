import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import type { Check, CheckResult } from "../types/result.js";

interface LighthousePage {
  route: string;
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
  metrics: Record<string, number | undefined>;
}

function concreteRoutes(routes: string[]): string[] {
  const filtered = routes.filter((route) => !/[\[\]:*]/.test(route));
  if (filtered.length === 0) return ["/"];
  if (!filtered.includes("/")) return ["/", ...filtered];
  return filtered;
}

function score(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

function getAuditRoutes(routes: string[], fullAudit = false): string[] {
  const pages = concreteRoutes(routes);

  if (fullAudit) {
    return pages;
  }

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const route of pages) {
    const key = route === "/" ? "/" : route.split("/")[1] || "/";

    if (!seen.has(key)) {
      seen.add(key);
      selected.push(route);
    }
  }

  return selected;
}

export class LighthouseCheck implements Check<LighthousePage[]> {
  readonly name = "Lighthouse Performance";

  constructor(
    private readonly baseUrl?: string,
    private readonly routes: string[] = [],
    private readonly fullAudit = false,
  ) {}

  async run(_projectPath: string): Promise<CheckResult<LighthousePage[]>> {
    const started = performance.now();

    if (!this.baseUrl) {
      return {
        name: this.name,
        status: "SKIPPED",
        score: null,
        message: "No runtime target available for Lighthouse audit",
        skipReason: "No runtime target available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const auditRoutes = getAuditRoutes(this.routes, this.fullAudit);
    if (!auditRoutes || auditRoutes.length === 0) {
      return {
        name: this.name,
        status: "SKIPPED",
        score: null,
        message: "No routes available for Lighthouse audit",
        skipReason: "No routes available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    let chrome: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      try {
        chrome = await launch({
          chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
        });
      } catch (launchError) {
        return {
          name: this.name,
          status: "ERROR",
          score: null,
          message: `Chrome launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
          errorReason: launchError instanceof Error ? launchError.message : String(launchError),
          duration: Math.round(performance.now() - started),
          pagesAttempted: auditRoutes.length,
          pagesCompleted: 0,
        };
      }

      const pages: LighthousePage[] = [];
      const skipped: string[] = [];

      for (const route of auditRoutes) {
        try {
          const targetUrl = new URL(route, this.baseUrl).href;
          const result = await lighthouse(targetUrl, {
            port: chrome.port,
            output: "json",
            logLevel: "error",
            maxWaitForLoad: 20_000,
            onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
          });

          if (!result) continue;

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
        } catch {
          skipped.push(route);
        }
      }

      if (pages.length === 0) {
        return {
          name: this.name,
          status: skipped.length > 0 ? "ERROR" : "SKIPPED",
          score: null,
          message: `Lighthouse failed on all ${skipped.length} page(s)`,
          errorReason: `All ${skipped.length} page(s) failed Lighthouse execution`,
          duration: Math.round(performance.now() - started),
          pagesAttempted: auditRoutes.length,
          pagesCompleted: 0,
          data: [],
        };
      }

      const performanceAvg = Math.round(pages.reduce((sum, p) => sum + p.performance, 0) / pages.length);
      const accessibilityAvg = Math.round(pages.reduce((sum, p) => sum + p.accessibility, 0) / pages.length);
      const bestPracticesAvg = Math.round(pages.reduce((sum, p) => sum + p.bestPractices, 0) / pages.length);
      const seoAvg = Math.round(pages.reduce((sum, p) => sum + p.seo, 0) / pages.length);

      const status = performanceAvg >= 90 ? "PASS" : performanceAvg >= 50 ? "WARNING" : "FAIL";

      return {
        name: this.name,
        status,
        score: performanceAvg,
        message: `${pages.length}/${auditRoutes.length} page(s) audited — Performance: ${performanceAvg} | Accessibility: ${accessibilityAvg} | Best Practices: ${bestPracticesAvg} | SEO: ${seoAvg}`,
        duration: Math.round(performance.now() - started),
        pagesDiscovered: this.routes.length,
        pagesAttempted: auditRoutes.length,
        pagesCompleted: pages.length,
        metadata: {
          metric: "Lighthouse Performance",
          categoryScores: {
            performance: performanceAvg,
            accessibility: accessibilityAvg,
            bestPractices: bestPracticesAvg,
            seo: seoAvg,
          },
        },
        data: pages,
      };
    } catch (error) {
      return {
        name: this.name,
        status: "ERROR",
        score: null,
        message: error instanceof Error ? error.message : String(error),
        errorReason: error instanceof Error ? error.message : String(error),
        duration: Math.round(performance.now() - started),
        pagesAttempted: auditRoutes.length,
        pagesCompleted: 0,
      };
    } finally {
      try {
        await chrome?.kill();
      } catch {
        // Cleanup should never hide Lighthouse result.
      }
    }
  }
}
