import { test } from 'node:test';
import assert from 'node:assert/strict';

// Run against an already-started local frontend:
// PUBLIC_SMOKE_ORIGIN=http://127.0.0.1:3110 npm test
// No provider credentials, database changes, or additional dependencies needed.
const origin = process.env.PUBLIC_SMOKE_ORIGIN;
const options = { skip: origin ? false : 'Set PUBLIC_SMOKE_ORIGIN to run local HTTP landing checks.' };
let cachedHome: Promise<string> | undefined;
function base() {
  const url = new URL(origin!);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Smoke tests must target a local server.');
  assert(['http:', 'https:'].includes(url.protocol));
  return url.origin;
}
async function home() {
  cachedHome ??= fetch(base(), { signal: AbortSignal.timeout(30000) }).then(async response => {
    assert.equal(response.status, 200);
    return response.text();
  });
  return cachedHome;
}
function links(html: string) { return [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&')); }
function ids(html: string) { return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])); }

test('landing renders the office design, page metadata and honest product scope', options, async () => {
  const html = await home();
  assert.match(html, /Ship Better Software/);
  assert.match(html, /with Confidence/);
  assert.match(html, /<title>QA Check Platform — Ship Better Software<\/title>/);
  assert.match(html, /Illustrative preview/);
  assert.match(html, /Scans run locally/);
  assert.match(html, /Hosted scan execution and team management are not implemented/);
  assert.doesNotMatch(html, /These platform capabilities are not yet available/);
});

test('all landing sections and same-page navigation anchors resolve', options, async () => {
  const html = await home(); const present = ids(html);
  for (const id of ['top', 'main', 'features', 'how-it-works', 'platform', 'open-source']) assert(present.has(id), id);
  for (const href of links(html).filter(value => value.startsWith('#'))) assert(present.has(href.slice(1)), href);
  assert.match(html, /Skip to content/);
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /aria-label="Footer navigation"/);
});

test('existing SaaS routes stay discoverable and internal links/fragments resolve', options, async () => {
  const html = await home(); const hrefs = links(html);
  for (const pathname of ['/login', '/register', '/demo', '/docs', '/features', '/pricing']) assert(hrefs.includes(pathname), pathname);
  const pages = new Map<string, string>([['/', html]]);
  for (const href of new Set(hrefs.filter(value => value.startsWith('/')))) {
    const url = new URL(href, base());
    if (!pages.has(url.pathname)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200, href);
      pages.set(url.pathname, await response.text());
    }
    if (url.hash) assert(ids(pages.get(url.pathname)!).has(url.hash.slice(1)), href);
  }
});

test('installation copy control and external links use the intended destinations', options, async () => {
  const html = await home(); const hrefs = links(html);
  assert.match(html, /npm install -g qa-check-cli/);
  assert.match(html, /aria-label="Copy installation command"/);
  assert.match(html, /role="status"/);
  assert.match(html, /Requires Node.js 22.19/);
  const allowed = new Set(['https://github.com/zeel2306/-QA-Check-CLI', 'https://github.com/zeel2306/-QA-Check-CLI#readme', 'https://www.npmjs.com/package/qa-check-cli']);
  for (const href of hrefs.filter(value => /^https?:/.test(value))) assert(allowed.has(href), href);
});

test('existing root security headers remain on the landing response', options, async () => {
  const response = await fetch(base(), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('public migration does not expose an unauthenticated workspace', options, async () => {
  const response = await fetch(`${base()}/dashboard`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  if ([302, 303, 307, 308].includes(response.status)) {
    assert.equal(new URL(response.headers.get('location')!, base()).pathname, '/login');
  } else {
    // Next.js may stream a redirect after its loading boundary has sent HTTP 200.
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<meta[^>]+id="__next-page-redirect"[^>]+http-equiv="refresh"[^>]+content="\d+;url=\/login"/);
    assert.doesNotMatch(html, /class="app-shell"/);
  }
  const projects = await fetch(`${base()}/api/v1/projects`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert([401, 503].includes(projects.status), 'Tenant data must fail closed without a session/configured services.');
});
