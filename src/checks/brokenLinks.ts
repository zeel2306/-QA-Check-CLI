import { BrowserCheck, mapLimit } from "./base.js";

async function checkUrl(url: string): Promise<number> {
  try { const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) }); return response.status; }
  catch { return 0; }
}

export class BrokenLinksCheck extends BrowserCheck {
  readonly name = "Broken Links";
  protected async evaluate(audit: Awaited<ReturnType<typeof this.audit>>) {
    const unique = [...new Map(audit.links.filter((link) => /^https?:/i.test(link.url)).map((link) => [link.url, link])).values()];
    const checked = await mapLimit(unique, 10, async (link) => ({ ...link, status: await checkUrl(link.url) }));
    const broken = checked.filter((link) => (link.status === 0 || link.status >= 400) && !link.external);
    const blockedExternal = checked.filter((link) => link.status >= 400 && link.external);
    return { status: broken.length ? "FAIL" as const : blockedExternal.length ? "WARNING" as const : "PASS" as const, message: `${broken.length} broken links${blockedExternal.length ? `; ${blockedExternal.length} external links blocked or rejected the checker` : ""}`, data: { broken, blockedExternal } };
  }
}
