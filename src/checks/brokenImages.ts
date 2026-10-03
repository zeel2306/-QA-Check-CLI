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

    // 1. Static analysis of local HTML files for image assets
    let htmlFiles: string[] = [];
    try {
      htmlFiles = await fg(["**/*.html"], {
        cwd: projectPath,
        ignore: ["**/node_modules/**", "**/reports/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"],
      });

      for (const relHtmlPath of htmlFiles) {
        const fullHtmlPath = path.join(projectPath, relHtmlPath);
        const content = await fsp.readFile(fullHtmlPath, "utf8").catch(() => "");

        const imgMatches = content.matchAll(/<(?:img|source|input)\b[^>]*\b(?:src|srcset)\s*=\s*["']([^"']+)["']/gi);

        for (const match of imgMatches) {
          const rawSrc = match[1]?.trim();
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

          if (rawSrc.startsWith("data:") || /^https?:\/\//i.test(rawSrc)) {
            continue;
          }

          const cleanPath = rawSrc.split(/[?#]/)[0];
          if (!cleanPath) continue;

          let targetFilePath: string;
          if (cleanPath.startsWith("/")) {
            targetFilePath = path.join(projectPath, cleanPath);
          } else {
            const htmlDir = path.dirname(fullHtmlPath);
            targetFilePath = path.join(htmlDir, cleanPath);
          }

          if (!fs.existsSync(targetFilePath)) {
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
          if (img.url && audit.imageResponses && audit.imageResponses[img.url]) {
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

    if (htmlFiles.length === 0 && auditImagesCount === 0) {
      return {
        name: this.name,
        status: "SKIPPED",
        message: "No HTML files or runtime images available to audit",
        skipReason: "No HTML files or runtime images found",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    // Deduplicate static + runtime findings by defect signature (canonicalRoute + type + canonicalAssetPath)
    const getSignature = (item: BrokenImageIssue, canonicalRoute: string) => {
      const canonicalAsset = toCanonicalAssetPath(item.url || "", canonicalRoute);
      return `${canonicalRoute}:${item.type}:${canonicalAsset}`;
    };

    const missingAssets = deduplicateFindings(staticMissing, runtimeMissing, getSignature);
    const warnings = deduplicateFindings(staticWarnings, runtimeWarnings, getSignature);

    const status = missingAssets.length ? "FAIL" : warnings.length ? "WARNING" : "PASS";
    const message = missingAssets.length
      ? `${missingAssets.length} missing image asset(s)`
      : "0 image issues";

    return {
      name: this.name,
      status,
      score: missingAssets.length ? Math.max(0, 100 - missingAssets.length * 20) : 100,
      message,
      duration: Math.round(performance.now() - started),
      pagesAttempted: htmlFiles.length || auditImagesCount,
      pagesCompleted: htmlFiles.length || auditImagesCount,
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
