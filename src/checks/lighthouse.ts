import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import type { Check, CheckResult } from "../types/result.js";

interface LighthousePage {
  route: string;
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  metrics: Record<string, number | undefined>;
}

function concreteRoutes(routes: string[]): string[] {
  const filtered = routes
    .map((route) => route.replace(/^[A-Z]+\s+/, ""))
    .filter(
      (route) => !/[\[\]:*]/.test(route) && !route.startsWith("/api/") && !route.startsWith("api/")
    );
  if (filtered.length === 0) return [];
  if (!filtered.includes("/")) return ["/", ...filtered];
  return filtered;
}

function score(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function getAuditRoutes(routes: string[], fullAudit = false): string[] {
  const pages = concreteRoutes(routes);
  if (pages.length === 0) return [];

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

export interface RouteDiagnostic {
  route: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "SUCCESS" | "FAILED" | "TIMED_OUT";
  error?: string;
}

export class LighthouseCheck implements Check<LighthousePage[]> {
  readonly name = "Lighthouse Performance";
  readonly timeoutMs = 180_000; // 3-minute timeout for multi-route audit

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

    if (!this.routes || this.routes.length === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        score: null,
        message: "No routes available for Lighthouse audit",
        skipReason: "No routes available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const auditRoutes = getAuditRoutes(this.routes, this.fullAudit);
    if (!auditRoutes || auditRoutes.length === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        score: null,
        message: "No browser-facing routes available for Lighthouse audit",
        skipReason: "No browser-facing routes available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    let chrome: Awaited<ReturnType<typeof launch>> | undefined;
    const routeDiagnostics: RouteDiagnostic[] = [];

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
        const routeStart = performance.now();
        const startedAtIso = new Date().toISOString();

        try {
          const targetUrl = new URL(route, this.baseUrl).href;

          // Per-route timeout isolation (25s timeout per route)
          const runRouteLighthouse = lighthouse(targetUrl, {
            port: chrome.port,
            output: "json",
            logLevel: "error",
            maxWaitForLoad: 20_000,
            onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
          });

          const routeTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Route ${route} Lighthouse audit timed out`)), 25_000);
          });

          const result = await Promise.race([runRouteLighthouse, routeTimeout]);
          const finishedAtIso = new Date().toISOString();
          const routeDuration = Math.round(performance.now() - routeStart);

          if (!result || !result.lhr) {
            skipped.push(route);
            routeDiagnostics.push({
              route,
              startedAt: startedAtIso,
              finishedAt: finishedAtIso,
              durationMs: routeDuration,
              status: "FAILED",
              error: "Lighthouse returned empty report",
            });
            continue;
          }

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

          routeDiagnostics.push({
            route,
            startedAt: startedAtIso,
            finishedAt: finishedAtIso,
            durationMs: routeDuration,
            status: "SUCCESS",
          });
        } catch (routeErr: any) {
          const finishedAtIso = new Date().toISOString();
          const routeDuration = Math.round(performance.now() - routeStart);
          const errMsg = routeErr instanceof Error ? routeErr.message : String(routeErr);
          skipped.push(route);

          routeDiagnostics.push({
            route,
            startedAt: startedAtIso,
            finishedAt: finishedAtIso,
            durationMs: routeDuration,
            status: errMsg.includes("timed out") ? "TIMED_OUT" : "FAILED",
            error: errMsg,
          });
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
          metadata: {
            routeDiagnostics,
          },
          data: [],
        };
      }

      const validPerf = pages.map((p) => p.performance).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
      const validA11y = pages.map((p) => p.accessibility).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
      const validBp = pages.map((p) => p.bestPractices).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
      const validSeo = pages.map((p) => p.seo).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));

      const accessibilityAvg = validA11y.length ? Math.round(validA11y.reduce((sum, p) => sum + p, 0) / validA11y.length) : 0;
      const bestPracticesAvg = validBp.length ? Math.round(validBp.reduce((sum, p) => sum + p, 0) / validBp.length) : 0;
      const seoAvg = validSeo.length ? Math.round(validSeo.reduce((sum, p) => sum + p, 0) / validSeo.length) : 0;

      if (validPerf.length === 0) {
        return {
          name: this.name,
          status: "SKIPPED",
          score: null,
          message: `${pages.length}/${auditRoutes.length} page(s) audited — Performance score unavailable (NO_FCP)`,
          skipReason: "Lighthouse performance score unavailable",
          duration: Math.round(performance.now() - started),
          pagesDiscovered: this.routes.length,
          pagesAttempted: auditRoutes.length,
          pagesCompleted: pages.length,
          metadata: {
            metric: "Lighthouse Performance",
            categoryScores: {
              performance: null,
              accessibility: accessibilityAvg,
              bestPractices: bestPracticesAvg,
              seo: seoAvg,
            },
            routeDiagnostics,
          },
          data: pages,
        };
      }

      const performanceAvg = Math.round(validPerf.reduce((sum, p) => sum + p, 0) / validPerf.length);
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
          routeDiagnostics,
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
        metadata: {
          routeDiagnostics,
        },
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
