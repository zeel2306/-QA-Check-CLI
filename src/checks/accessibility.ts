import fsp from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { BrowserCheck } from "./base.js";
import type { BrowserIssue, CheckResult } from "../types/result.js";
import { deduplicateFindings, toCanonicalRoute } from "../core/canonical.js";

export class AccessibilityCheck extends BrowserCheck {
  readonly name = "Accessibility";

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const staticIssues: BrowserIssue[] = [];
    const runtimeIssues: BrowserIssue[] = [];

    let pagesAttempted = 0;
    let pagesSuccessfullyAudited = 0;
    let skipReason: string | undefined;

    // 1. Static HTML accessibility scan
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

        // a. Check <html lang="...">
        if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(content)) {
          staticIssues.push({
            route: relHtmlPath,
            type: "html-has-lang",
            message: "<html> element must have a valid lang attribute",
            selector: "html",
          });
        }

        // b. Check <img> missing alt attribute
        const imgTagMatches = content.matchAll(/<img\b([^>]*)>/gi);
        for (const match of imgTagMatches) {
          const attributes = match[1] || "";
          if (!/\balt\s*=/i.test(attributes)) {
            staticIssues.push({
              route: relHtmlPath,
              type: "image-alt",
              message: "Images must have alt text",
              selector: "img",
            });
          }
        }

        // c. Check unlabeled form controls (<input>, <select>, <textarea>)
        const inputMatches = content.matchAll(/<(input|select|textarea)\b([^>]*)>/gi);
        for (const match of inputMatches) {
          const tag = match[1];
          const attrs = match[2] || "";
          const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
          const inputType = typeMatch ? typeMatch[1].toLowerCase() : "text";

          if (["hidden", "submit", "button", "reset", "image"].includes(inputType)) continue;

          const hasId = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
          const hasAriaLabel = /\baria-label(ledby)?\s*=/i.test(attrs);

          let hasMatchingLabel = false;
          if (hasId && hasId[1]) {
            const idVal = hasId[1];
            const labelRegex = new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${idVal}["']`, "i");
            hasMatchingLabel = labelRegex.test(content);
          }

          if (!hasAriaLabel && !hasMatchingLabel) {
            staticIssues.push({
              route: relHtmlPath,
              type: "label",
              message: `Form element <${tag}${inputType !== "text" ? ` type="${inputType}"` : ""}> must have an accessible label`,
              selector: `${tag}${hasId ? `#${hasId[1]}` : ""}`,
            });
          }
        }

        // d. Check icon-only buttons without accessible name
        const buttonMatches = content.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gsi);
        for (const match of buttonMatches) {
          const attrs = match[1] || "";
          const body = match[2] || "";
          const hasAriaLabel = /\baria-label(ledby)?\s*=/i.test(attrs) || /\btitle\s*=/i.test(attrs);
          const textContent = body.replace(/<[^>]+>/g, "").trim();

          if (!textContent && !hasAriaLabel) {
            staticIssues.push({
              route: relHtmlPath,
              type: "button-name",
              message: "Buttons must have discernible text or accessible name",
              selector: "button",
            });
          }
        }

        pagesSuccessfullyAudited += 1;
      }
    } catch {
      // Ignore glob errors
    }

    // 2. Playwright + axe-core runtime accessibility audit
    try {
      const audit = await this.audit();
      if (audit && audit.accessibility) {
        if (audit.seo && audit.seo.length > 0) {
          pagesAttempted += audit.seo.length;
          pagesSuccessfullyAudited += audit.seo.length;
        }

        for (const runtimeIssue of audit.accessibility) {
          runtimeIssues.push(runtimeIssue);
        }
      }
    } catch (err) {
      skipReason = err instanceof Error ? err.message : String(err);
    }

    if (pagesSuccessfullyAudited === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        score: null,
        message: "No pages successfully audited for accessibility",
        skipReason: skipReason || "No runtime URL or HTML files available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Deduplicate static + runtime findings by signature (canonicalRoute + type + selector/message)
    const getSignature = (item: BrowserIssue, canonicalRoute: string) => {
      return `${canonicalRoute}:${item.type}:${item.selector || item.message}`;
    };

    const deduplicated = deduplicateFindings(staticIssues, runtimeIssues, getSignature);

    const inspectedPages = Math.max(pagesSuccessfullyAudited, 1);
    const score = Math.max(0, Math.round(100 - (deduplicated.length / inspectedPages) * 10));
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
      message: deduplicated.length === 0 ? "No accessibility issues found" : summary,
      duration: Math.round(performance.now() - started),
      pagesAttempted,
      pagesCompleted: pagesSuccessfullyAudited,
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