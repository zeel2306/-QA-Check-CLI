import fsp from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { BrowserCheck } from "./base.js";
import type { BrowserIssue, CheckResult } from "../types/result.js";
import { deduplicateFindings, toCanonicalRoute } from "../core/canonical.js";

export class SeoCheck extends BrowserCheck {
  readonly name = "SEO";

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const staticIssues: BrowserIssue[] = [];
    const runtimeIssues: BrowserIssue[] = [];

    let pagesAttempted = 0;
    let pagesCompleted = 0;

    // 1. Static HTML page-level SEO analysis
    let htmlFiles: string[] = [];
    try {
      htmlFiles = await fg(["**/*.html"], {
        cwd: projectPath,
        ignore: ["**/node_modules/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"],
      });

      for (const relHtmlPath of htmlFiles) {
        const fullHtmlPath = path.join(projectPath, relHtmlPath);
        const content = await fsp.readFile(fullHtmlPath, "utf8").catch(() => "");
        pagesAttempted += 1;

        // Check <title>
        const titleMatch = content.match(/<title\b[^>]*>(.*?)<\/title>/i);
        const titleText = titleMatch ? titleMatch[1].trim() : "";
        if (!titleText) {
          staticIssues.push({
            route: relHtmlPath,
            type: "missing-title",
            message: "Missing document title tag (<title>)",
          });
        }

        // Check <meta name="viewport">
        if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(content)) {
          staticIssues.push({
            route: relHtmlPath,
            type: "missing-viewport",
            message: "Missing viewport meta tag",
          });
        }

        // Check <html lang="...">
        if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(content)) {
          staticIssues.push({
            route: relHtmlPath,
            type: "missing-html-lang",
            message: "Missing html lang attribute",
          });
        }

        // Check <meta name="description">
        if (!/<meta\b[^>]*\bname\s*=\s*["']description["']/i.test(content)) {
          staticIssues.push({
            route: relHtmlPath,
            type: "missing-description",
            message: "Missing meta description tag",
          });
        }

        pagesCompleted += 1;
      }
    } catch {
      // Ignore glob errors
    }

    // 2. Runtime SEO audit & robots.txt / sitemap.xml checks
    let baseUrl: string | undefined;
    try {
      const audit = await this.audit();
      if (audit) {
        baseUrl = audit.baseUrl;

        for (const page of audit.seo) {
          pagesAttempted += 1;
          pagesCompleted += 1;

          const add = (type: string, message: string) => runtimeIssues.push({ route: page.route, type, message });
          if (!page.title) add("missing-title", "Missing document title");
          if (!page.description) add("missing-description", "Missing meta description");
          if (!page.canonical) add("missing-canonical", "Missing canonical URL");
          if (!page.hasOpenGraph) add("missing-open-graph", "Missing Open Graph metadata");
          if (!page.hasTwitterCard) add("missing-twitter-card", "Missing Twitter Card metadata");
          if (page.h1Count === 0) add("missing-h1", "Missing H1");
          if (page.h1Count > 1) add("multiple-h1", `Found ${page.h1Count} H1 elements`);
        }

        if (baseUrl) {
          const hasStaticRobots = (await fg(["**/robots.{txt,ts,js}"], { cwd: projectPath, ignore: ["**/node_modules/**"] })).length > 0;
          const hasStaticSitemap = (await fg(["**/sitemap.{xml,ts,js}"], { cwd: projectPath, ignore: ["**/node_modules/**"] })).length > 0;

          for (const endpoint of ["/robots.txt", "/sitemap.xml"]) {
            const isRobots = endpoint === "/robots.txt";
            if ((isRobots && hasStaticRobots) || (!isRobots && hasStaticSitemap)) {
              continue;
            }

            try {
              const response = await fetch(new URL(endpoint, baseUrl), {
                signal: AbortSignal.timeout(5_000),
              });
              if (!response.ok) {
                runtimeIssues.push({
                  route: endpoint,
                  type: "missing-seo-file",
                  message: `${endpoint} returned HTTP ${response.status}`,
                });
              }
            } catch {
              runtimeIssues.push({
                route: endpoint,
                type: "missing-seo-file",
                message: `${endpoint} is unavailable`,
              });
            }
          }
        }
      }
    } catch {
      // Runtime audit unavailable
    }

    if (pagesCompleted === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        score: null,
        message: "No pages or HTML files audited for SEO",
        skipReason: "No HTML files or runtime target available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Deduplicate static + runtime findings by signature (canonicalRoute + type)
    const getSignature = (item: BrowserIssue, canonicalRoute: string) => {
      return `${canonicalRoute}:${item.type}`;
    };

    const deduplicated = deduplicateFindings(staticIssues, runtimeIssues, getSignature);

    const inspectedPages = Math.max(pagesCompleted, 1);
    const score = Math.max(0, Math.round(100 - (deduplicated.length / inspectedPages) * 15));
    const status = deduplicated.length === 0 ? "PASS" : score >= 70 ? "WARNING" : "FAIL";

    const grouped = deduplicated.reduce((acc, issue) => {
      const typeKey = issue.type || "unknown";
      acc[typeKey] = (acc[typeKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const summary = Object.entries(grouped)
      .map(([type, count]) => `• ${type}: ${count}`)
      .join("\n");

    return {
      name: this.name,
      status,
      score,
      message: deduplicated.length === 0 ? "No SEO issues found" : summary,
      duration: Math.round(performance.now() - started),
      pagesAttempted,
      pagesCompleted,
      data: {
        totalIssues: deduplicated.length,
        grouped,
        issues: deduplicated,
      },
    };
  }

  protected async evaluate(): Promise<never> {
    throw new Error("Unreachable");
  }
}
