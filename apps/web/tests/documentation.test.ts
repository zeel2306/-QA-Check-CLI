import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docsNavigation, docsHref } from '../src/components/docs/navigation';
import { searchDocumentation } from '../src/components/docs/search';
import { copyText } from '../src/components/docs/clipboard';

test('documentation navigation includes the migrated builder and preserves eight existing guides', () => {
 assert.equal(docsNavigation.length, 9);
 assert.equal(new Set(docsNavigation.map(p => docsHref(p.slug))).size, 9);
 assert(docsNavigation.some(p => String(p.slug) === 'command-builder'));
});
test('search handles empty input, case, multiple terms, and unmatched queries', () => {
 assert.deepEqual(searchDocumentation('  '), []);
 assert.deepEqual(searchDocumentation('CHROME'), searchDocumentation('chrome'));
 assert(searchDocumentation('node version').some(r => r.href.includes('unsupported-node')));
 assert.deepEqual(searchDocumentation('nonexistentdocumentationterm'), []);
});
test('search preserves SaaS integration anchors and FAQ/error deep links', () => {
 assert(searchDocumentation('upload').some(r => r.href === '/docs#upload'));
 assert(searchDocumentation('CI secrets').some(r => r.href === '/docs#ci'));
 assert(searchDocumentation('Node.js version').some(r => r.href.startsWith('/docs/faq#')));
 assert(searchDocumentation('error').some(r => r.href.startsWith('/docs/errors#')));
 assert(searchDocumentation('builder').some(r => r.href === '/docs/command-builder'));
});
test('clipboard reports success only after writing the exact text', async () => {
 let actual = ''; assert.deepEqual(await copyText('qa-check .', async text => { actual = text; }), { status: 'copied' });
 assert.equal(actual, 'qa-check .');
});
test('clipboard handles rejected, unavailable, and empty writes safely', async () => {
 assert.deepEqual(await copyText('command', async () => { throw Error('denied'); }), { status: 'error' });
 assert.deepEqual(await copyText('command', () => { throw TypeError('unavailable'); }), { status: 'error' });
 assert.deepEqual(await copyText('', async () => assert.fail('must not write')), { status: 'error' });
});
const origin = process.env.PUBLIC_SMOKE_ORIGIN;
const options = { skip: origin ? false : 'Set PUBLIC_SMOKE_ORIGIN to run documentation HTTP checks.' };
const pages = new Map<string, string>();
async function page(path: string) {
 const base = new URL(origin!); assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
 if (!pages.has(path)) { const response = await fetch(new URL(path, base)); assert.equal(response.status, 200, path); pages.set(path, await response.text()); }
 return pages.get(path)!;
}
test('all documentation guides render with navigation, search, and scoped main', options, async () => {
 for (const item of docsNavigation) {
  const html = await page(docsHref(item.slug));
  assert.match(html, /id="docs-main"/); assert.match(html, /Search documentation/);
  assert.match(html, /aria-current="page"/); assert.match(html, /<h1>/);
  assert(html.includes('href="/docs/command-builder"'));
 }
});
test('all documentation internal links and fragments resolve', options, async () => {
 for (const item of docsNavigation) {
  const path = docsHref(item.slug); const html = await page(path);
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
   const href = match[1].replaceAll('&amp;', '&'); if (!href.startsWith('/') && !href.startsWith('#')) continue;
   const url = new URL(href, new URL(path, origin!)); const target = await page(url.pathname);
   if (url.hash) assert(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${path}: ${href}`);
  }
 }
});
test('upload and CI handbook anchors and precautions remain available', options, async () => {
 const html = await page('/docs');
 for (const text of ['id="upload"', 'id="ci"', 'QA_CHECK_PROJECT_ID', 'QA_CHECK_TOKEN', 'clientRunId', '2 MiB', 'fork pull requests', 'ConvertTo-Json -Depth 30']) assert(html.includes(text), text);
 assert.match(html, /22\.19\.0/); assert(!html.includes('Node.js 20 or later'));
});
test('unknown documentation slugs still return HTTP 404 after builder migration', options, async () => {
 for (const path of ['/docs/unknown-guide', '/docs/another-unknown']) assert.equal((await fetch(new URL(path, origin!))).status, 404, path);
});

test('every search-index destination and fragment resolves', options, async () => {
 const entries = new Map(['Guide', 'Troubleshooting', 'FAQ', 'Error reference', 'SaaS integration']
  .flatMap(query => searchDocumentation(query)).map(entry => [entry.href, entry]));
 assert(entries.size > 50);
 for (const { href } of entries.values()) {
  const url = new URL(href, origin!); const html = await page(url.pathname);
  if (url.hash) assert(html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), href);
 }
});
