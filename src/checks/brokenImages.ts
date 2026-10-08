import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { BrowserCheck } from "./base.js";
import type { CheckResult } from "../types/result.js";
import { deduplicateFindings, toCanonicalAssetPath } from "../core/canonical.js";

export interface BrokenImageIssue {
  type: "missing-image-asset" | "broken-image-http" | "invalid-image-src";
  file?: string;
  route: string;
  url: string;
  reason: string;
  alt?: string;
  sources?: ("static" | "runtime")[];
  evidence?: Record<string, string>;
}

export class BrokenImagesCheck extends BrowserCheck {
  readonly name = "Broken Images";

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const staticMissing: BrokenImageIssue[] = [];
    const staticWarnings: BrokenImageIssue[] = [];
    const runtimeMissing: BrokenImageIssue[] = [];
    const runtimeWarnings: BrokenImageIssue[] = [];

    // 1. Static analysis of local HTML and JS/JSX/TS/TSX files for image assets
    let htmlFiles: string[] = [];
    let jsFiles: string[] = [];
    try {
      htmlFiles = await fg(["**/*.html"], {
        cwd: projectPath,
        ignore: ["**/node_modules/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"],
      });

      jsFiles = await fg(["src/**/*.{js,jsx,ts,tsx,vue}", "app/**/*.{js,jsx,ts,tsx,vue}"], {
        cwd: projectPath,
        ignore: ["**/node_modules/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"],
      });

      const checkAssetExists = (rawSrc: string, baseDir: string): boolean => {
        const cleanPath = rawSrc.split(/[?#]/)[0];
        if (!cleanPath) return true;

        const candidatePaths: string[] = [];
        if (cleanPath.startsWith("/")) {
          candidatePaths.push(path.join(projectPath, "public", cleanPath));
          candidatePaths.push(path.join(projectPath, "src", cleanPath));
          candidatePaths.push(path.join(projectPath, "src", "assets", cleanPath.replace(/^\/assets\//, "")));
          candidatePaths.push(path.join(projectPath, cleanPath));
        } else {
          candidatePaths.push(path.join(baseDir, cleanPath));
          candidatePaths.push(path.join(projectPath, "public", cleanPath));
          candidatePaths.push(path.join(projectPath, "src", cleanPath));
          candidatePaths.push(path.join(projectPath, "src", "assets", cleanPath.replace(/^assets\//, "")));
          candidatePaths.push(path.join(projectPath, cleanPath));
        }
        return candidatePaths.some((p) => fs.existsSync(p));
      };

      for (const relHtmlPath of htmlFiles) {
        const fullHtmlPath = path.join(projectPath, relHtmlPath);
        const content = await fsp.readFile(fullHtmlPath, "utf8").catch(() => "");
        const imgMatches = content.matchAll(/<(?:img|source|input)\b[^>]*\b(?:src|\[src\]|:src|v-bind:src|srcset)\s*=\s*(?:["']([^"']+)["']|\{?["']([^"']+)["']\}?)/gi);

        for (const match of imgMatches) {
          let rawSrc = (match[1] ?? match[2])?.trim();
          if (rawSrc) {
            rawSrc = rawSrc.replace(/^['"\[\s]+|['"\]\s]+$/g, "");
          }
          if (!rawSrc) {
            staticWarnings.push({
              type: "invalid-image-src",
              file: relHtmlPath,
              route: relHtmlPath,
              url: "(empty)",
              reason: "Image tag missing or has empty src attribute",
            });
            continue;
          }

          if (rawSrc.startsWith("data:") || /^https?:\/\//i.test(rawSrc)) continue;

          if (!checkAssetExists(rawSrc, path.dirname(fullHtmlPath))) {
            staticMissing.push({
              type: "missing-image-asset",
              file: relHtmlPath,
              route: relHtmlPath,
              url: rawSrc,
              reason: "Asset file does not exist on disk",
            });
          }
        }
      }

      for (const relJsPath of jsFiles) {
        const fullJsPath = path.join(projectPath, relJsPath);
        const content = await fsp.readFile(fullJsPath, "utf8").catch(() => "");
        const imgMatches = content.matchAll(/<img\b[^>]*\b(?:src|\[src\]|:src|v-bind:src)\s*=\s*(?:["']([^"']+)["']|\{?["']([^"']+)["']\}?)/gi);

        for (const match of imgMatches) {
          let rawSrc = (match[1] ?? match[2])?.trim();
          if (rawSrc) {
            rawSrc = rawSrc.replace(/^['"\[\s]+|['"\]\s]+$/g, "");
          }
          if (!rawSrc) continue;

          if (rawSrc.startsWith("data:") || /^https?:\/\//i.test(rawSrc)) continue;

          // Only validate string literal paths (e.g. /assets/hero-missing.jpg or ./logo.png)
          if (!/\.(png|jpe?g|gif|svg|webp|avif|ico)(\?.*)?$/i.test(rawSrc) && !rawSrc.startsWith("/")) continue;

          if (!checkAssetExists(rawSrc, path.dirname(fullJsPath))) {
            staticMissing.push({
              type: "missing-image-asset",
              file: relJsPath,
              route: relJsPath,
              url: rawSrc,
              reason: "Asset file does not exist on disk",
            });
          }
        }
      }
    } catch {
      // Ignore glob errors
    }

    // 2. Perform runtime image response audit if browser audit is available
    let auditImagesCount = 0;
    try {
      const audit = await this.audit();
      if (audit && audit.images && audit.images.length > 0) {
        auditImagesCount = audit.images.length;
        for (const img of audit.images) {
          if (img.broken) {
            runtimeMissing.push({
              type: "missing-image-asset",
              route: img.route,
              url: img.url,
              reason: "Image failed to render (0 natural width)",
              alt: img.alt,
            });
          } else if (img.url && audit.imageResponses && audit.imageResponses[img.url]) {
            const status = audit.imageResponses[img.url];
            if (status >= 400) {
              runtimeMissing.push({
                type: status === 404 ? "missing-image-asset" : "broken-image-http",
                route: img.route,
                url: img.url,
                reason: `HTTP ${status}`,
                alt: img.alt,
              });
            }
          }
        }
      }
    } catch {
      // Browser audit unavailable
    }

    if (htmlFiles.length === 0 && staticMissing.length === 0 && staticWarnings.length === 0 && auditImagesCount === 0 && runtimeMissing.length === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        message: "No HTML files or runtime images available to audit",
        skipReason: "No HTML files or runtime images found",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Deduplicate static + runtime findings by defect signature (type + canonicalAssetPath)
    const getSignature = (item: BrokenImageIssue, canonicalRoute: string) => {
      const canonicalAsset = toCanonicalAssetPath(item.url || "", canonicalRoute);
      return `${item.type}:${canonicalAsset}`;
    };

    const missingAssets = deduplicateFindings(staticMissing, runtimeMissing, getSignature);
    const warnings = deduplicateFindings(staticWarnings, runtimeWarnings, getSignature);

    const runtimePageCount = (await this.audit().catch(() => null))?.seo?.length || 0;
    const pagesAttempted = runtimePageCount || htmlFiles.length || jsFiles.length || auditImagesCount;
    const pagesCompleted = pagesAttempted;

    const status = missingAssets.length ? "FAIL" : warnings.length ? "WARNING" : "PASS";
    const message = missingAssets.length
      ? `${pagesCompleted}/${pagesAttempted} pages audited — ${missingAssets.length} missing image asset(s)`
      : `${pagesCompleted}/${pagesAttempted} pages audited — 0 image issues`;

    return {
      name: this.name,
      status,
      score: missingAssets.length ? Math.max(0, 100 - missingAssets.length * 20) : 100,
      message,
      duration: Math.round(performance.now() - started),
      pagesAttempted,
      pagesCompleted,
      data: {
        totalIssues: missingAssets.length + warnings.length,
        issues: [...missingAssets, ...warnings],
      },
    };
  }

  protected async evaluate(): Promise<never> {
    throw new Error("Unreachable");
  }
}
