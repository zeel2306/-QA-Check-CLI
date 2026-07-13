import { BrowserCheck } from "./base.js";
export class PerformanceCheck extends BrowserCheck {
    name = "Performance";
    async evaluate(audit) {
        const slow = audit.performance.filter((item) => item.load > 3000 || item.ttfb > 800);
        const score = audit.performance.length ? Math.max(0, Math.round(100 - slow.length / audit.performance.length * 50)) : 0;
        return { status: slow.length ? "WARNING" : "PASS", score, message: `${slow.length} slow pages`, data: audit.performance };
    }
}
