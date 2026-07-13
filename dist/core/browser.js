import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import axe from "axe-core";
export const VIEWPORTS = {
    Desktop: { width: 1920, height: 1080 },
    Laptop: { width: 1366, height: 768 },
    Tablet: { width: 768, height: 1024 },
    Mobile: { width: 390, height: 844 },
    Landscape: { width: 844, height: 390 },
};
async function navigate(page, url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    // Allow hydration, fonts, and initial images to settle without waiting for
    // analytics, polling, or WebSockets to become idle.
    await page.waitForTimeout(150);
}
async function installLayoutShiftObserver(page) {
    await page.addInitScript(() => {
        const state = window;
        state.__qaCls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput)
                    state.__qaCls = (state.__qaCls ?? 0) + entry.value;
            }
        }).observe({ type: "layout-shift", buffered: true });
    });
}
function concreteRoutes(routes) {
    return routes.filter((route) => !/[\[\]:*]/.test(route));
}
function safeName(route) {
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
function shouldIgnore(url) {
    return IGNORED_DOMAINS.some((domain) => url.includes(domain));
}
async function inspectResponsive(page, route, viewport) {
    return page.evaluate(({ route, viewport }) => {
        const issues = [];
        const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth + 1;
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
        for (const element of document.querySelectorAll("body *")) {
            const rect = element.getBoundingClientRect();
            if (hasHorizontalScroll &&
                rect.width > 0 &&
                (rect.right > window.innerWidth + 1 || rect.left < -1)) {
                issues.push({
                    route,
                    viewport,
                    type: "viewport-overflow",
                    message: "Element extends outside the viewport",
                    selector: element.tagName.toLowerCase(),
                });
                if (issues.length >= 50)
                    break;
            }
            const style = getComputedStyle(element);
            if (element.innerText?.trim() &&
                style.textOverflow === "ellipsis" &&
                element.scrollWidth > element.clientWidth + 1) {
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
        for (const control of document.querySelectorAll('button,[role="button"],input[type="submit"]')) {
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
            ...document.querySelectorAll("header,nav"),
        ].filter((element) => ["fixed", "sticky"].includes(getComputedStyle(element).position));
        const heading = document.querySelector("main h1, main h2, h1");
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
        const cls = window.__qaCls ?? 0;
        if (cls > 0.1)
            issues.push({
                route,
                viewport,
                type: "layout-shift",
                message: `Cumulative layout shift is ${cls.toFixed(3)}`,
            });
        return issues;
    }, { route, viewport });
}
async function inspectPage(page, route, baseUrl) {
    const result = await page.evaluate((route) => {
        const meta = (selector) => document.querySelector(selector)?.content ?? "";
        const canonical = document.querySelector('link[rel="canonical"]')?.href;
        const links = [
            ...document.querySelectorAll("a[href]"),
        ].map((a) => a.href);
        const images = [...document.images].map((img) => ({
            url: img.currentSrc || img.src,
            alt: img.getAttribute("alt") ?? undefined,
        }));
        const navigation = performance.getEntriesByType("navigation")[0];
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
                hasStructuredData: Boolean(document.querySelector('script[type="application/ld+json"]')),
                lang: document.documentElement.lang || undefined,
            },
            links,
            images,
            performance: navigation
                ? {
                    route,
                    ttfb: navigation.responseStart - navigation.requestStart,
                    load: navigation.loadEventEnd - navigation.startTime,
                    domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime,
                }
                : undefined,
        };
    }, route);
    await page.addScriptTag({ content: axe.source });
    const axeResult = await page.evaluate(async () => (await globalThis.axe.run())
        .violations);
    return {
        seo: [result.seo],
        accessibility: axeResult.flatMap((violation) => violation.nodes.map((node) => ({
            route,
            type: violation.id,
            message: violation.help,
            selector: node.target.join(" "),
        }))),
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
function emptyAudit(baseUrl, routes) {
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
        skippedRoutes: routes.filter((route) => !concreteRoutes(routes).includes(route)),
        imageResponses: {},
    };
}
/** Runs one shared Playwright pass and collects evidence for all browser checks. */
export async function runBrowserAudit(baseUrl, routes, reportDir) {
    const audit = emptyAudit(baseUrl, routes);
    const browser = await chromium.launch({
        headless: true,
    });
    const screenshotDir = path.join(reportDir, "screenshots");
    await fs.mkdir(screenshotDir, {
        recursive: true,
    });
    const allRoutes = concreteRoutes(routes);
    const CONCURRENCY = 4;
    try {
        for (let i = 0; i < allRoutes.length; i += CONCURRENCY) {
            const batch = allRoutes.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (route) => {
                // -------------------------
                // Desktop Audit
                // -------------------------
                const context = await browser.newContext({
                    viewport: VIEWPORTS.Desktop,
                });
                const page = await context.newPage();
                await installLayoutShiftObserver(page);
                page.on("console", (message) => {
                    if (message.type() === "error") {
                        audit.console.push({
                            route,
                            type: "console-error",
                            message: message.text(),
                        });
                    }
                });
                page.on("pageerror", (error) => {
                    audit.console.push({
                        route,
                        type: "javascript-exception",
                        message: error.message,
                    });
                });
                page.on("requestfailed", (request) => {
                    if (shouldIgnore(request.url())) {
                        return;
                    }
                    audit.network.push({
                        route,
                        type: "failed-request",
                        message: request.failure()?.errorText ?? "Request failed",
                        url: request.url(),
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
                        });
                    }
                });
                page.on("response", (response) => {
                    if (response.request().resourceType() === "image") {
                        audit.imageResponses[response.url()] = response.status();
                    }
                    if (response.status() >= 400 && !shouldIgnore(response.url())) {
                        audit.network.push({
                            route,
                            type: `http-${response.status()}`,
                            message: `HTTP ${response.status()}`,
                            url: response.url(),
                        });
                    }
                });
                await navigate(page, new URL(route, baseUrl).href);
                const data = await inspectPage(page, route, baseUrl);
                audit.seo.push(...data.seo);
                audit.accessibility.push(...data.accessibility);
                audit.links.push(...data.links);
                audit.images.push(...data.images);
                audit.performance.push(...data.performance);
                await context.close();
                // -------------------------
                // Responsive Audit
                // -------------------------
                const responsiveContext = await browser.newContext();
                const responsivePage = await responsiveContext.newPage();
                await installLayoutShiftObserver(responsivePage);
                for (const [name, viewport] of Object.entries(VIEWPORTS)) {
                    await responsivePage.setViewportSize(viewport);
                    await navigate(responsivePage, new URL(route, baseUrl).href);
                    const issues = await inspectResponsive(responsivePage, route, name);
                    audit.responsive.push(...issues);
                    // Save screenshot only if an issue was found
                    if (issues.length > 0) {
                        const screenshot = path.join(screenshotDir, `${safeName(route)}-${name.toLowerCase()}.png`);
                        await responsivePage.screenshot({
                            path: screenshot,
                            fullPage: true,
                        });
                        audit.screenshots.push(screenshot);
                    }
                }
                await responsiveContext.close();
            }));
        }
        return audit;
    }
    finally {
        await browser.close();
    }
}
