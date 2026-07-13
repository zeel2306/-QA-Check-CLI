export class BrowserCheck {
    audit;
    constructor(audit) {
        this.audit = audit;
    }
    async run(_projectPath) {
        const started = performance.now();
        try {
            return { name: this.name, ...await this.evaluate(await this.audit()), duration: performance.now() - started };
        }
        catch (error) {
            return { name: this.name, status: "SKIPPED", message: error instanceof Error ? error.message : String(error), duration: performance.now() - started };
        }
    }
}
export function issueStatus(count) {
    return count === 0 ? "PASS" : "FAIL";
}
export function scoreFromIssues(issues, inspected) {
    return inspected === 0 ? 0 : Math.max(0, Math.round(100 - (issues / inspected) * 20));
}
export async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index]);
        }
    }));
    return results;
}
