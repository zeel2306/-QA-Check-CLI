import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { BrowserCheck, mapLimit } from "./base.js";
import type { CheckResult } from "../types/result.js";
import { deduplicateFindings, toCanonicalTargetHref } from "../core/canonical.js";
import { discoverDeclaredApplicationRoutes } from "../crawler.js";
import { matchesAnyDeclaredRoute } from "../utils/routes.js";

async function checkUrl(url: string): Promise<number> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

export interface BrokenLinkIssue {
  type: "broken-internal-link" | "broken-external-link" | "suspicious-hash-link" | "javascript-link" | "invalid-link-target";
  file?: string;
  route: string;
  url: string;
  target?: string;
  reason: string;
  external?: boolean;
  sources?: ("static" | "runtime")[];
  evidence?: Record<string, string>;
}

export class BrokenLinksCheck extends BrowserCheck {
  readonly name = "Broken Links";

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const staticBroken: BrokenLinkIssue[] = [];
    const staticWarnings: BrokenLinkIssue[] = [];
    const runtimeBroken: BrokenLinkIssue[] = [];
    const runtimeWarnings: BrokenLinkIssue[] = [];

    // 1. Static analysis of local HTML and JS/JSX/TS/TSX files
    let htmlFiles: string[] = [];
    let jsFiles: string[] = [];
    const declaredRoutes = new Set<string>(["/"]);

    try {
      htmlFiles = await fg(["**/*.html"], {
        cwd: projectPath,
        ignore: ["**/node_modules/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"],
      });

      jsFiles = await fg(["src/**/*.{js,jsx,ts,tsx,vue}", "app/**/*.{js,jsx,ts,tsx,vue}"], {
        cwd: projectPath,
        ignore: ["**/node_modules/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"],
      });

      for (const route of await discoverDeclaredApplicationRoutes(projectPath)) declaredRoutes.add(route);

      // Check HTML files
      for (const relHtmlPath of htmlFiles) {
        const fullHtmlPath = path.join(projectPath, relHtmlPath);
        const content = await fsp.readFile(fullHtmlPath, "utf8").catch(() => "");
        const rawHrefs: string[] = [];

        for (const m of content.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi)) {
          if (m[1] !== undefined) rawHrefs.push(m[1]);
        }
        for (const m of content.matchAll(/<a\b[^>]*\brouterLink\s*=\s*["']([^"']*)["']/gi)) {
          if (m[1] !== undefined) rawHrefs.push(m[1]);
        }
        for (const m of content.matchAll(/<a\b[^>]*\b\[routerLink\]\s*=\s*["']?\s*\[?\s*["']([^"']+)["']\s*\]?\s*["']?/gi)) {
          if (m[1] !== undefined) rawHrefs.push(m[1]);
        }

        for (const rawHrefInput of rawHrefs) {
          const rawHref = rawHrefInput?.trim()?.replace(/^['"\[\s]+|['"\]\s]+$/g, "");
          if (rawHref === undefined) continue;

          if (/^(mailto:|tel:)/i.test(rawHref)) continue;

          if (/^javascript:/i.test(rawHref)) {
            staticWarnings.push({
              type: "javascript-link",
              file: relHtmlPath,
              route: relHtmlPath,
              url: rawHref,
              reason: "Non-navigational script link using javascript: pseudo-protocol",
            });
            continue;
          }

          if (rawHref === "#" || rawHref === "") {
            staticWarnings.push({
              type: "suspicious-hash-link",
              file: relHtmlPath,
              route: relHtmlPath,
              url: rawHref || "(empty)",
              reason: "Suspicious hash anchor 'href=\"#\"'",
            });
            continue;
          }

          if (/^https?:\/\//i.test(rawHref)) continue;

          const cleanPath = rawHref.split(/[?#]/)[0];
          if (!cleanPath) continue;

          let targetFilePath: string;
          if (cleanPath.startsWith("/")) {
            targetFilePath = path.join(projectPath, cleanPath);
          } else {
            const htmlDir = path.dirname(fullHtmlPath);
            targetFilePath = path.join(htmlDir, cleanPath);
          }

          const normRoute = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
          if (!fs.existsSync(targetFilePath) && !matchesAnyDeclaredRoute(normRoute, declaredRoutes)) {
            staticBroken.push({
              type: "broken-internal-link",
              file: relHtmlPath,
              route: relHtmlPath,
              url: rawHref,
              reason: "Target file or route does not exist",
            });
          }
        }
      }

      // Check JS/TSX/Vue files
      for (const relJsPath of jsFiles) {
        const fullJsPath = path.join(projectPath, relJsPath);
        const content = await fsp.readFile(fullJsPath, "utf8").catch(() => "");
        const linkMatches = content.matchAll(/<(?:a|Link|NavLink|RouterLink|router-link)\b[^>]*\b(?:href|to|:to|routerLink|\[routerLink\])\s*=\s*(?:["']([^"']*)["']|\{?["']([^"']+)["']\}?)/gi);

        for (const match of linkMatches) {
          const rawHref = (match[1] ?? match[2])?.trim()?.replace(/^['"\[\s]+|['"\]\s]+$/g, "");
          if (rawHref === undefined) continue;

          if (/^(mailto:|tel:)/i.test(rawHref)) continue;

          if (/^javascript:/i.test(rawHref)) {
            staticWarnings.push({
              type: "javascript-link",
              file: relJsPath,
              route: relJsPath,
              url: rawHref,
              reason: "Non-navigational script link using javascript: pseudo-protocol",
            });
            continue;
          }

          if (rawHref === "#") {
            staticWarnings.push({
              type: "suspicious-hash-link",
              file: relJsPath,
              route: relJsPath,
              url: rawHref,
              reason: "Suspicious hash anchor 'href=\"#\"'",
            });
            continue;
          }

          if (rawHref === "") {
            staticWarnings.push({
              type: "invalid-link-target",
              file: relJsPath,
              route: relJsPath,
              url: "(empty)",
              reason: "Link target is empty",
            });
            continue;
          }

          if (/^https?:\/\//i.test(rawHref)) continue;

          const cleanPath = rawHref.split(/[?#]/)[0];
          if (!cleanPath) continue;

          // Skip dynamic route parameters like /products/:id or [id]
          if (cleanPath.includes(":") || cleanPath.includes("*") || cleanPath.includes("[")) continue;

          const normRoute = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
          let targetFilePath: string;
          if (cleanPath.startsWith("/")) {
            targetFilePath = path.join(projectPath, cleanPath);
          } else {
            const jsDir = path.dirname(fullJsPath);
            targetFilePath = path.join(jsDir, cleanPath);
          }

          if (!matchesAnyDeclaredRoute(normRoute, declaredRoutes) && !fs.existsSync(targetFilePath) && !fs.existsSync(targetFilePath + ".html")) {
            staticBroken.push({
              type: "broken-internal-link",
              file: relJsPath,
              route: relJsPath,
              url: rawHref,
              reason: "Target route does not exist in application",
            });
          }
        }
      }
    } catch {
      // Ignore glob errors
    }

    // 2. Perform runtime URL check if browser audit is available
    let auditLinksCount = 0;
    try {
      const audit = await this.audit();
      if (audit && audit.links && audit.links.length > 0) {
        auditLinksCount = audit.links.length;
        const unique = [...new Map(audit.links.filter((link) => /^https?:/i.test(link.url)).map((link) => [link.url, link])).values()];
        const checked = await mapLimit(unique, 10, async (link) => ({ ...link, status: await checkUrl(link.url) }));

        for (const link of checked) {
          if ((link.status === 0 || link.status >= 400) && !link.external) {
            runtimeBroken.push({
              type: "broken-internal-link",
              route: link.route,
              url: link.url,
              reason: link.status === 0 ? "Network connection failed" : `HTTP ${link.status}`,
            });
          } else if (link.status >= 400 && link.external) {
            runtimeWarnings.push({
              type: "broken-external-link",
              route: link.route,
              url: link.url,
              reason: `External HTTP ${link.status}`,
              external: true,
            });
          }
        }
      }
    } catch {
      // Browser audit unavailable
    }

    if (htmlFiles.length === 0 && staticBroken.length === 0 && staticWarnings.length === 0 && auditLinksCount === 0 && runtimeBroken.length === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        message: "No HTML files or runtime links available to audit",
        skipReason: "No HTML files or runtime links found",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Deduplicate static + runtime findings by defect signature (canonicalRoute + type + canonicalTargetHref)
    const getSignature = (item: BrokenLinkIssue, canonicalRoute: string) => {
      const canonicalTarget = toCanonicalTargetHref(item.url || item.target || "", canonicalRoute);
      return `${canonicalRoute}:${item.type}:${canonicalTarget}`;
    };

    const broken = deduplicateFindings(staticBroken, runtimeBroken, getSignature);
    const warnings = deduplicateFindings(staticWarnings, runtimeWarnings, getSignature);

    const runtimePageCount = (await this.audit().catch(() => null))?.seo?.length || 0;
    const pagesAttempted = runtimePageCount || htmlFiles.length || jsFiles.length || auditLinksCount;
    const pagesCompleted = pagesAttempted;

    const status = broken.length ? "FAIL" : warnings.length ? "WARNING" : "PASS";
    const msgLines: string[] = [];
    if (broken.length) msgLines.push(`${broken.length} broken internal link(s)`);
    if (warnings.length) msgLines.push(`${warnings.length} link warning(s)`);
    if (msgLines.length === 0) msgLines.push("0 broken links");

    const message = `${pagesCompleted}/${pagesAttempted} pages audited — ${msgLines.join("; ")}`;

    return {
      name: this.name,
      status,
      score: broken.length ? Math.max(0, 100 - broken.length * 20) : 100,
      message,
      duration: Math.round(performance.now() - started),
      pagesAttempted,
      pagesCompleted,
      data: {
        totalIssues: broken.length + warnings.length,
        issues: [...broken, ...warnings],
      },
    };
  }

  protected async evaluate(): Promise<never> {
    throw new Error("Unreachable");
  }
}
