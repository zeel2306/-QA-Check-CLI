import fs from "fs/promises";
import path from "path";
import { chromium, type Browser, type Page } from "playwright";
import axe from "axe-core";
import { inspectFormLabels } from "./formLabels.js";
import type { BrowserIssue, PageAuditSummary, PerRouteTargetAudit } from "../types/result.js";
import type { AuthSession } from "./auth.js";
import { runtimeSettings, navigateReady, type RuntimeSettings } from "./readiness.js";

export const VIEWPORTS = {
  Desktop: { width: 1920, height: 1080 },
  Laptop: { width: 1366, height: 768 },
  Tablet: { width: 768, height: 1024 },
  Mobile: { width: 390, height: 844 },
  Landscape: { width: 844, height: 390 },
} as const;

export interface SeoPageData {
  route: string;
  title: string;
  description: string;
  canonical?: string;
  h1Count: number;
  missingAlt: number;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasStructuredData: boolean;
  lang?: string;
}

export interface LinkData {
  route: string;
  url: string;
  status?: number;
  external: boolean;
}
export interface ImageData {
  route: string;
  url: string;
  status?: number;
  alt?: string;
  bytes?: number;
  broken?: boolean;
}
export interface PerformanceData {
  route: string;
  ttfb: number;
  load: number;
  domContentLoaded: number;
}
export interface BrowserAudit {
  baseUrl: string;
  seo: SeoPageData[];
  responsive: BrowserIssue[];
  accessibility: BrowserIssue[];
  links: LinkData[];
  images: ImageData[];
  console: BrowserIssue[];
  network: BrowserIssue[];
  performance: PerformanceData[];
  screenshots: string[];
  skippedRoutes: string[];
  imageResponses: Record<string, number>;
  pageSummary: PageAuditSummary;
  routeAudits: PerRouteTargetAudit[];
}

export function routeBatches(routes: string[], concurrency: number): string[][] {
  const unique = [...new Set(routes)];
  const limit = Math.max(1, Math.min(8, Math.floor(concurrency)));
  return Array.from({ length: Math.ceil(unique.length / limit) }, (_, index) => unique.slice(index * limit, (index + 1) * limit));
}

async function navigate(page: Page, url: string, settings: RuntimeSettings, initial: boolean, signal?: AbortSignal): Promise<void> {
  const status = await navigateReady(page, url, settings, initial, signal);
  // File discovery may describe a page served by an extensionless Node router.
  if (status === 404 && new URL(url).pathname.endsWith(".html")) {
    const alternate = new URL(url); alternate.pathname = alternate.pathname.slice(0, -5);
    await navigateReady(page, alternate.href, settings, initial, signal);
  }
  // Wait for asynchronous fetch/XHR network requests triggered during React hydration/useEffect
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = window as typeof window & { __qaCls?: number };
    state.__qaCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (!entry.hadRecentInput)
          state.__qaCls = (state.__qaCls ?? 0) + entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

export function concreteRoutes(routes: string[]): string[] {
  return [...new Set(routes
    .map((route) => route.replace(/^[A-Z]+\s+/, ""))
    .filter(
      (route) =>
        !/[\[\]{}:*]/.test(route) &&
        !route.startsWith("/api/") &&
        !route.startsWith("api/") &&
        !route.startsWith("src/") &&
        !route.startsWith("/src/") &&
        !/\.(tsx?|jsx?)$/i.test(route)
    ))];
}

function safeName(route: string): string {
  return route === "/" ? "home" : route.slice(1).replace(/[^a-z0-9]+/gi, "-");
}
const IGNORED_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "connect.facebook.net",
  "doubleclick.net",
  "gstatic.com",
  "google.com",
];

function shouldIgnore(url: string) {
  return IGNORED_DOMAINS.some((domain) => url.includes(domain));
}

async function inspectResponsive(
  page: Page,
  route: string,
  viewport: string,
): Promise<BrowserIssue[]> {
  return page.evaluate(
    ({ route, viewport }) => {
      const issues: BrowserIssue[] = [];
      const hasHorizontalScroll =
        document.documentElement.scrollWidth > window.innerWidth + 1;
      if (hasHorizontalScroll) {
        issues.push({
          route,
          viewport,
          type: "horizontal-scroll",
          message: `Page width ${document.documentElement.scrollWidth}px exceeds viewport ${window.innerWidth}px`,
        });
      }
      if (!document.querySelector('meta[name="viewport"]')) {
        issues.push({
          route,
          viewport,
          type: "missing-viewport",
          message: "Missing viewport meta tag",
        });
      }
      for (const element of document.querySelectorAll<HTMLElement>("body *")) {
        const rect = element.getBoundingClientRect();
        if (
          hasHorizontalScroll &&
          rect.width > 0 &&
          (rect.right > window.innerWidth + 1 || rect.left < -1)
        ) {
          issues.push({
            route,
            viewport,
            type: "viewport-overflow",
            message: "Element extends outside the viewport",
            selector: element.tagName.toLowerCase(),
          });
          if (issues.length >= 50) break;
        }
        const style = getComputedStyle(element);
        if (
          element.innerText?.trim() &&
          style.textOverflow === "ellipsis" &&
          element.scrollWidth > element.clientWidth + 1
        ) {
          issues.push({
            route,
            viewport,
            type: "text-clipping",
            message: "Text content is clipped",
            selector: element.tagName.toLowerCase(),
          });
        }
      }
      for (const image of document.images) {
        const rect = image.getBoundingClientRect();
        if (hasHorizontalScroll && rect.width > window.innerWidth + 1)
          issues.push({
            route,
            viewport,
            type: "image-overflow",
            message: "Image is wider than the viewport",
            selector: "img",
          });
        if (!image.srcset && image.naturalWidth > window.innerWidth * 2)
          issues.push({
            route,
            viewport,
            type: "responsive-image",
            message: "Large image has no srcset",
            url: image.currentSrc,
          });
      }
      for (const control of document.querySelectorAll<HTMLElement>(
        'button,[role="button"],input[type="submit"]',
      )) {
        const rect = control.getBoundingClientRect();
        if (rect.left < 0 || rect.right > window.innerWidth)
          issues.push({
            route,
            viewport,
            type: "cut-off-control",
            message: "Interactive control is cut off horizontally",
            selector: control.tagName.toLowerCase(),
          });
      }
      const fixedHeaders = [
        ...document.querySelectorAll<HTMLElement>("header,nav"),
      ].filter((element) =>
        ["fixed", "sticky"].includes(getComputedStyle(element).position),
      );
      const heading = document.querySelector<HTMLElement>(
        "main h1, main h2, h1",
      );
      if (heading)
        for (const header of fixedHeaders) {
          const a = header.getBoundingClientRect();
          const b = heading.getBoundingClientRect();
          if (a.bottom > b.top && a.top < b.bottom)
            issues.push({
              route,
              viewport,
              type: "fixed-header-overlap",
              message: "Fixed header overlaps page content",
              selector: header.tagName.toLowerCase(),
            });
        }
      const cls = (window as typeof window & { __qaCls?: number }).__qaCls ?? 0;
      if (cls > 0.1)
        issues.push({
          route,
          viewport,
          type: "layout-shift",
          message: `Cumulative layout shift is ${cls.toFixed(3)}`,
        });
      return issues;
    },
    { route, viewport },
  );
}

async function inspectPage(
  page: Page,
  route: string,
  baseUrl: string,
  formLabelPolicy?: "associated" | "visible",
): Promise<
  Omit<
    BrowserAudit,
    | "baseUrl"
    | "responsive"
    | "screenshots"
    | "skippedRoutes"
    | "imageResponses"
    | "pageSummary"
    | "routeAudits"
  >
> {
  const result = await page.evaluate((route) => {
    const meta = (selector: string) =>
      document.querySelector<HTMLMetaElement>(selector)?.content ?? "";
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    )?.href;
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ].map((a) => a.href);
    const images = [...document.images].map((img) => ({
      url: img.currentSrc || img.src,
      alt: img.getAttribute("alt") ?? undefined,
      broken: img.complete && img.naturalWidth === 0 && Boolean(img.currentSrc || img.src) && !(img.currentSrc || img.src).startsWith("data:"),
    }));
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return {
      seo: {
        route,
        title: document.title,
        description: meta('meta[name="description"]'),
        canonical,
        h1Count: document.querySelectorAll("h1").length,
        missingAlt: images.filter((image) => image.alt === undefined).length,
        hasOpenGraph: Boolean(meta('meta[property^="og:"]')),
        hasTwitterCard: Boolean(meta('meta[name^="twitter:"]')),
        hasStructuredData: Boolean(
          document.querySelector('script[type="application/ld+json"]'),
        ),
        lang: document.documentElement.lang || undefined,
      },
      links,
      images,
      performance: navigation
        ? {
            route,
            ttfb: navigation.responseStart - navigation.requestStart,
            load: navigation.loadEventEnd - navigation.startTime,
            domContentLoaded:
              navigation.domContentLoadedEventEnd - navigation.startTime,
          }
        : undefined,
    };
  }, route);

  await page.addScriptTag({ content: axe.source });
  const axeResult = await page.evaluate(
    async () =>
      (await (globalThis as typeof globalThis & { axe: typeof axe }).axe.run())
        .violations,
  );
  return {
    seo: [result.seo],
    accessibility: [...await inspectFormLabels(page, route, formLabelPolicy), ...axeResult.flatMap((violation) =>
      violation.nodes.map((node) => ({
        route,
        type: violation.id,
        message: violation.help,
        selector: node.target.join(" "),
      })),
    )],
    links: result.links.map((url) => ({
      route,
      url,
      external: new URL(url).origin !== new URL(baseUrl).origin,
    })),
    images: result.images.map((image) => ({ route, ...image })),
    console: [],
    network: [],
    performance: result.performance ? [result.performance] : [],
  };
}

function emptyAudit(baseUrl: string, routes: string[]): BrowserAudit {
  const concrete = concreteRoutes(routes);
  return {
    baseUrl,
    seo: [],
    responsive: [],
    accessibility: [],
    links: [],
    images: [],
    console: [],
    network: [],
    performance: [],
    screenshots: [],
    skippedRoutes: routes.filter(
      (route) => !concrete.includes(route),
    ),
    imageResponses: {},
    pageSummary: {
      eligible: concrete.length,
      attempted: 0,
      completed: 0,
      passed: 0,
      failed: 0,
      timedOut: 0,
      blocked: 0,
      unverified: routes.length - concrete.length,
    },
    routeAudits: [],
  };
}

/** Runs one shared Playwright pass and collects evidence for all browser checks. */
export async function runBrowserAudit(
  baseUrl: string,
  routes: string[],
  reportDir: string,
  authSession?: AuthSession,
  settings: RuntimeSettings = runtimeSettings(),
  signal?: AbortSignal,
  formLabelPolicy?: "associated" | "visible",
): Promise<BrowserAudit> {
  const audit = emptyAudit(baseUrl, routes);
  if (!concreteRoutes(routes).length) return audit;

  const screenshotDir = path.join(reportDir, "screenshots");

  await fs.mkdir(screenshotDir, {
    recursive: true,
  });
  const browser: Browser = await chromium.launch({
    headless: true,
    timeout: settings.browserLaunchTimeoutMs,
  });

  const allRoutes = concreteRoutes(routes);
  const CONCURRENCY = settings.browserConcurrency;
  const PER_PAGE_TIMEOUT_MS = settings.routeTimeoutMs;
  const deadline = Date.now() + settings.browserAuditTimeoutMs;
  const cancel = () => { void browser.close().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    let i = 0;
    for (const batch of routeBatches(allRoutes, CONCURRENCY)) {
      if (signal?.aborted || Date.now() >= deadline) {
        for (const route of allRoutes.slice(i)) {
          audit.pageSummary.unverified++;
          audit.routeAudits.push({ route, status: "SKIPPED", errorMessage: signal?.aborted ? "Scan cancelled" : "Browser audit budget exhausted" });
        }
        break;
      }

      await Promise.all(
        batch.map(async (route, batchIdx) => {
          const routeIndex = i + batchIdx + 1;
          audit.pageSummary.attempted++;
          const routeStartTime = Date.now();
          console.log(`[Browser Audit] (${routeIndex}/${allRoutes.length}) Auditing route: ${route}`);

          let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
          let responsiveContext:
            | Awaited<ReturnType<Browser["newContext"]>>
            | undefined;

          let isTimeout = false;
          let closingContext = false;
          let documentFailure: BrowserIssue | undefined;
          let routeError: string | undefined;

          try {
            const auditRoutePass = async () => {
              context = await browser.newContext({
                viewport: VIEWPORTS.Desktop,
                extraHTTPHeaders: authSession?.headers,
              });

              if (authSession?.cookies && authSession.cookies.length > 0) {
                await context.addCookies(authSession.cookies);
              }

              const page = await context.newPage();

              await installLayoutShiftObserver(page);

              page.on("console", (message) => {
                if (message.type() === "error") {
                  const text = message.text();
                  let type = "console-error";
                  if (text.includes("Failed to load resource") || text.includes("404")) {
                    type = "resource-load-error";
                  } else if (text.includes("Warning:") || text.includes("React will")) {
                    type = "framework-warning";
                  }
                  audit.console.push({
                    route,
                    type,
                    message: text,
                  });
                }
              });

              page.on("pageerror", (error) => {
                let type = "javascript-exception";
                if (error.message.includes("Unhandled Promise Rejection") || error.name === "UnhandledRejection") {
                  type = "unhandled-rejection";
                }
                audit.console.push({
                  route,
                  type,
                  message: error.message,
                });
              });

              page.on("requestfailed", (request) => {
                if (isTimeout || closingContext || signal?.aborted) return;
                if (shouldIgnore(request.url())) {
                  return;
                }

                const failureReason = request.failure()?.errorText ?? "Request failed";
                if (/ERR_ABORTED/.test(failureReason)) return; // Cancellation is not a confirmed network defect.
                audit.network.push({
                  route,
                  type: "failed-request",
                  message: `${request.method()} ${request.url()} - ${failureReason}`,
                  url: request.url(),
                  method: request.method(),
                  resourceType: request.resourceType(),
                  reason: failureReason,
                });
              });

              page.on("requestfinished", (request) => {
                if (shouldIgnore(request.url())) {
                  return;
                }

                const timing = request.timing();

                if (timing.responseEnd > 2000) {
                  audit.network.push({
                    route,
                    type: "slow-request",
                    message: `${Math.round(timing.responseEnd)}ms response`,
                    url: request.url(),
                    method: request.method(),
                    resourceType: request.resourceType(),
                  });
                }
              });

              page.on("response", (response) => {
                const url = response.url();
                const req = response.request();
                if (req.resourceType() === "image") {
                  audit.imageResponses[url] = response.status();
                }

                if (shouldIgnore(url)) {
                  return;
                }

                const status = response.status();
                const contentType = response.headers()["content-type"] || "";
                const isApiRoute = url.includes("/api/") || req.resourceType() === "fetch" || req.resourceType() === "xhr";
                if (req.resourceType() === "document") {
                  documentFailure = status >= 400 ? { route, type: `http-${status}`, message: `HTTP ${status} ${response.statusText()}`.trim(), url, method: req.method(), status, resourceType: "document" } : undefined;
                  // Retry/compilation responses are infrastructure evidence. Only the
                  // final successfully navigated document can confirm a page defect.
                  if (status >= 400) return;
                }

                if (status >= 400) {
                  audit.network.push({
                    route,
                    type: `http-${status}`,
                    message: `HTTP ${status} ${response.statusText()}`.trim(),
                    url,
                    method: req.method(),
                    status,
                    statusText: response.statusText(),
                    resourceType: req.resourceType(),
                  });
                } else if (status === 200 && isApiRoute && url.includes("/api/") && contentType.includes("text/html")) {
                  audit.network.push({
                    route,
                    type: "http-404",
                    message: `API endpoint returned HTML page (SPA fallback 404)`,
                    url,
                    method: req.method(),
                    status: 404,
                    statusText: "Not Found (SPA Fallback)",
                    resourceType: req.resourceType(),
                  });
                }
              });

              await navigate(page, new URL(route, baseUrl).href, settings, true, signal);
              if (documentFailure) audit.network.push(documentFailure);

              const data = await inspectPage(page, route, baseUrl, formLabelPolicy);

              audit.seo.push(...data.seo);
              audit.accessibility.push(...data.accessibility);
              audit.links.push(...data.links);
              audit.images.push(...data.images);
              audit.performance.push(...data.performance);

              closingContext = true;
              await context.close();
              context = undefined;

              responsiveContext = await browser.newContext({ extraHTTPHeaders: authSession?.headers });
              if (authSession?.cookies?.length) await responsiveContext.addCookies(authSession.cookies);

              const responsivePage = await responsiveContext.newPage();

              await installLayoutShiftObserver(responsivePage);

              for (const [name, viewport] of Object.entries(VIEWPORTS)) {
                await responsivePage.setViewportSize(viewport);

                await navigate(responsivePage, new URL(route, baseUrl).href, settings, false, signal);

                const issues = await inspectResponsive(
                  responsivePage,
                  route,
                  name,
                );

                audit.responsive.push(...issues);

                if (issues.length > 0) {
                  const screenshot = path.join(
                    screenshotDir,
                    `${safeName(route)}-${name.toLowerCase()}.png`,
                  );

                  await responsivePage.screenshot({
                    path: screenshot,
                    fullPage: true,
                  });

                  audit.screenshots.push(screenshot);
                }
              }

              await responsiveContext.close();
              responsiveContext = undefined;
            };

            // Bounded per-page timeout race
            let timeoutId: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                isTimeout = true;
                reject(new Error(`Navigation/inspection timeout after ${PER_PAGE_TIMEOUT_MS / 1000}s`));
              }, Math.max(1, Math.min(PER_PAGE_TIMEOUT_MS, deadline - Date.now())));
            });

            try {
              await Promise.race([auditRoutePass(), timeoutPromise]);
            } finally {
              if (timeoutId) clearTimeout(timeoutId);
            }

            const durationMs = Date.now() - routeStartTime;
            audit.pageSummary.completed++;
            audit.pageSummary.passed++;
            audit.routeAudits.push({
              route,
              status: "PASSED",
              durationMs,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            routeError = message;
            const durationMs = Date.now() - routeStartTime;

            if (signal?.aborted || /blocked by authentication/i.test(message)) {
              audit.pageSummary.blocked++;
              audit.routeAudits.push({ route, status: "BLOCKED", durationMs, errorMessage: signal?.aborted ? "Scan cancelled" : message });
            } else if (isTimeout || /timeout|timed out/i.test(message)) {
              console.warn(`[Browser Audit] Route ${route} timed out after ${PER_PAGE_TIMEOUT_MS / 1000}s - preserving completed findings and continuing`);
              audit.pageSummary.timedOut++;
              audit.routeAudits.push({
                route,
                status: "TIMED_OUT",
                durationMs,
                errorMessage: message,
              });
            } else {
              console.warn(`[Browser Audit] Route ${route} audit failed: ${message}`);
              audit.pageSummary.failed++;
              audit.routeAudits.push({
                route,
                status: "FAILED",
                durationMs,
                errorMessage: message,
              });
            }

            audit.skippedRoutes.push(`${route}: ${message}`);
          } finally {
            closingContext = true;
            await context?.close().catch(() => undefined);
            await responsiveContext?.close().catch(() => undefined);
          }
        }),
      );
      i += batch.length;
    }

    return audit;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await browser.close();
  }
}
