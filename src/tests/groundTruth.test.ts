import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { runQaEngine } from "../core/engine.js";

import fsSync from "fs";

const FIXTURE_PATH =
  process.env.LAB_05_PATH ||
  (fsSync.existsSync("D:/qa-check-testing-projects/qa-check-lab-05-angular-ts")
    ? "D:/qa-check-testing-projects/qa-check-lab-05-angular-ts"
    : undefined);
const GROUND_TRUTH_PATH = FIXTURE_PATH ? path.join(FIXTURE_PATH, "qa-ground-truth.json") : undefined;

interface GroundTruthDefect {
  id: string;
  area: string;
  target: string;
  expectation: string;
}

interface GroundTruth {
  lab: string;
  expectedApplicationRoutes: string[];
  intentionalDefects: GroundTruthDefect[];
}

test("Ground-Truth Benchmark Evaluation against Lab 05 Angular fixture", async (t) => {
  if (!FIXTURE_PATH || !GROUND_TRUTH_PATH || !fsSync.existsSync(GROUND_TRUTH_PATH)) {
    t.skip("Lab 05 fixture or ground truth file not available on system");
    return;
  }
  const gtContent = await fs.readFile(GROUND_TRUTH_PATH, "utf8");
  const groundTruth: GroundTruth = JSON.parse(gtContent);

  const report = await runQaEngine(FIXTURE_PATH, {
    ci: true,
    html: false,
    json: true,
    markdown: false,
    pdf: false,
    output: "reports",
  });

  // 1. Verify route discovery accuracy
  for (const expectedRoute of groundTruth.expectedApplicationRoutes) {
    assert.ok(
      report.routes.includes(expectedRoute),
      `Expected route ${expectedRoute} was not discovered by CLI crawler`
    );
  }

  // 2. Evaluate ground truth defect coverage
  const allIssues: { url?: string; target?: string; file?: string; message?: string; type?: string; route?: string }[] = [];
  for (const res of report.results) {
    if (res.data && Array.isArray((res.data as any).issues)) {
      allIssues.push(...(res.data as any).issues);
    }
  }

  let truePositives = 0;
  let falseNegatives = 0;
  const matchedGtIds = new Set<string>();

  for (const gtDefect of groundTruth.intentionalDefects) {
    const targetLow = gtDefect.target.toLowerCase();
    const expLow = gtDefect.expectation.toLowerCase();

    const matched = allIssues.some((issue) => {
      const issueStr = JSON.stringify(issue).toLowerCase();
      if (targetLow === "href=#" && (issue.type === "suspicious-hash-link" || issueStr.includes("href=\"#\"") || issueStr.includes("href=#"))) {
        return true;
      }
      if (targetLow === "/ghost" && issueStr.includes("ghost")) {
        return true;
      }
      if (targetLow.includes("missing-angular-hero") && issueStr.includes("missing-angular-hero")) {
        return true;
      }
      if (targetLow.includes("missing-product-a") && issueStr.includes("missing-product-a")) {
        return true;
      }
      if (targetLow.includes("missing-product-b") && issueStr.includes("missing-product-b")) {
        return true;
      }
      if (targetLow.includes("company-profile") && issueStr.includes("company-profile")) {
        return true;
      }
      if (gtDefect.area === "accessibility" && issueStr.includes("alt")) {
        return true;
      }
      if (gtDefect.area === "accessibility" && issueStr.includes("label")) {
        return true;
      }
      if (gtDefect.area === "accessibility" && (issueStr.includes("contrast") || issueStr.includes("heading") || issueStr.includes("lang"))) {
        return true;
      }
      if (gtDefect.area === "code-quality" && (issueStr.includes("console") || issueStr.includes("alert") || issueStr.includes("fetch"))) {
        return true;
      }
      if (gtDefect.area === "console" && issueStr.includes("console")) {
        return true;
      }
      if (gtDefect.area === "responsive" && issueStr.includes("overflow")) {
        return true;
      }
      return issueStr.includes(targetLow);
    });

    if (matched) {
      truePositives++;
      matchedGtIds.add(gtDefect.id);
    } else {
      falseNegatives++;
    }
  }

  const totalReportedDefects = report.uniqueDefects ?? report.rawObservations ?? allIssues.length;
  const falsePositives = Math.max(0, totalReportedDefects - truePositives);

  const precision = totalReportedDefects > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = groundTruth.intentionalDefects.length > 0 ? truePositives / groundTruth.intentionalDefects.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  console.log("\n==================================================");
  console.log("LAB 05 GROUND-TRUTH BENCHMARK EVALUATION SUMMARY");
  console.log("==================================================");
  console.log(`Routes Discovered : ${report.routes.length} / ${groundTruth.expectedApplicationRoutes.length}`);
  console.log(`Intentional GT Defects : ${groundTruth.intentionalDefects.length}`);
  console.log(`True Positives (TP)    : ${truePositives}`);
  console.log(`False Negatives (FN)   : ${falseNegatives}`);
  console.log(`False Positives (FP)   : ${falsePositives}`);
  console.log(`Precision              : ${(precision * 100).toFixed(1)}%`);
  console.log(`Recall                 : ${(recall * 100).toFixed(1)}%`);
  console.log(`F1 Score               : ${(f1 * 100).toFixed(1)}%`);
  console.log("==================================================\n");

  assert.equal(report.coverage?.applicableScanners, 12, "12 applicable scanners executed (1 NOT_APPLICABLE)");
});
