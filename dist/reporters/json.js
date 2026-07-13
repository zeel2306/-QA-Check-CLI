import fs from "fs/promises";
import path from "path";
export async function writeJsonReport(report, reportDir) {
    const output = path.join(reportDir, "report.json");
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
    return output;
}
