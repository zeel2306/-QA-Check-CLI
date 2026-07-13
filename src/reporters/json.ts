import fs from "fs/promises";
import path from "path";
import type { AuditReport } from "../types/result.js";

export async function writeJsonReport(report: AuditReport, reportDir: string): Promise<string> {
  const output = path.join(reportDir, "report.json");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  return output;
}
