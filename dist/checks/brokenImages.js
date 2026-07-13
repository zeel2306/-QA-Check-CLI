import { BrowserCheck, mapLimit } from "./base.js";
export class BrokenImagesCheck extends BrowserCheck {
    name = "Broken Images";
    async evaluate(audit) {
        const unique = [...new Map(audit.images.map((image) => [image.url, image])).values()];
        const checked = await mapLimit(unique, 10, async (image) => {
            const browserStatus = audit.imageResponses[image.url];
            if (browserStatus !== undefined)
                return { ...image, status: browserStatus };
            try {
                const response = await fetch(image.url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
                return { ...image, status: response.status, bytes: Number(response.headers.get("content-length") ?? 0) };
            }
            catch {
                return { ...image, status: 0 };
            }
        });
        const issues = checked.filter((image) => !image.alt || !image.status || image.status >= 400 || (image.bytes ?? 0) > 1_000_000);
        return { status: issues.length ? "FAIL" : "PASS", message: `${issues.length} image issues`, data: issues };
    }
}
