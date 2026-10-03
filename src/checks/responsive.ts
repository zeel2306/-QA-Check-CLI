import fsp from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { BrowserCheck } from "./base.js";
import type { BrowserIssue, CheckResult } from "../types/result.js";
import { deduplicateFindings, toCanonicalRoute } from "../core/canonical.js";

export class ResponsiveCheck extends BrowserCheck {
  readonly name = "Responsive";

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const staticIssues: BrowserIssue[] = [];
    const runtimeIssues: BrowserIssue[] = [];

    let pagesAttempted = 0;
    let pagesCompleted = 0;

    // 1. Perform static analysis of HTML files for missing viewport meta tag
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

        if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(content)) {
          staticIssues.push({
            route: relHtmlPath,
            type: "missing-viewport",
            message: "Missing viewport meta tag (<meta name=\"viewport\" content=\"...\">)",
          });
        }
        pagesCompleted += 1;
      }
    } catch {
      // Ignore glob errors
    }

    // 2. Perform Playwright runtime responsive audit if available
    let screenshots: string[] = [];
    let skippedRoutes: string[] = [];
    try {
      const audit = await this.audit();
      if (audit) {
        if (audit.responsive && audit.responsive.length > 0) {
          for (const item of audit.responsive) {
            runtimeIssues.push(item);
          }
        }
        if (audit.screenshots) screenshots = audit.screenshots;
        if (audit.skippedRoutes) skippedRoutes = audit.skippedRoutes;
        if (audit.seo && audit.seo.length > 0) {
          pagesAttempted += audit.seo.length;
          pagesCompleted += audit.seo.length;
        }
      }
    } catch {
      // Browser audit unavailable
    }

    // Zero execution must NEVER be PASS
    if (pagesCompleted === 0) {
      return {
        name: this.name,
        status: "SKIPPED",
        score: null,
        message: "No pages or HTML files audited for responsive layout",
        skipReason: "No HTML files or runtime target available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Deduplicate static + runtime findings by signature (canonicalRoute + type + viewport + selector/message)
    const getSignature = (item: BrowserIssue, canonicalRoute: string) => {
      return `${canonicalRoute}:${item.type}:${item.viewport || ""}:${item.selector || item.message}`;
    };

    const deduplicated = deduplicateFindings(staticIssues, runtimeIssues, getSignature);

    const status = deduplicated.length === 0 ? "PASS" : "FAIL";

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
      score: deduplicated.length === 0 ? 100 : Math.max(0, 100 - deduplicated.length * 25),
      message: deduplicated.length === 0 ? "No responsive issues found" : summary,
      duration: Math.round(performance.now() - started),
      pagesAttempted,
      pagesCompleted,
      data: {
        totalIssues: deduplicated.length,
        grouped,
        issues: deduplicated,
        screenshots,
        skippedRoutes,
      },
    };
  }

  protected async evaluate(): Promise<never> {
    throw new Error("Unreachable");
  }
}