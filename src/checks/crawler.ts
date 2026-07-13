import { discoverRoutes } from "../crawler.js";
import type { Check, CheckResult } from "../types/result.js";

export interface CrawlerData { framework: string; routes: string[] }

export class CrawlerCheck implements Check<CrawlerData> {
  readonly name = "Pages";
  async run(projectPath: string): Promise<CheckResult<CrawlerData>> {
    const started = performance.now();
    const data = await discoverRoutes(projectPath);
    return { name: this.name, status: data.routes.length ? "PASS" : "WARNING", message: `${data.routes.length} routes`, duration: performance.now() - started, data };
  }
}
