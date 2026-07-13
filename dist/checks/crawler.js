import { discoverRoutes } from "../crawler.js";
export class CrawlerCheck {
    name = "Pages";
    async run(projectPath) {
        const started = performance.now();
        const data = await discoverRoutes(projectPath);
        return { name: this.name, status: data.routes.length ? "PASS" : "WARNING", message: `${data.routes.length} routes`, duration: performance.now() - started, data };
    }
}
