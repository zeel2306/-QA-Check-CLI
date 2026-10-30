import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
// From the repository root, with the root SaaS production server already running:
// node apps/web/tests/documentation.browser.mjs
// Uses the repository's existing Playwright installation; no service credentials needed.
mkdirSync('scratch', { recursive: true });
const origin=process.env.PUBLIC_SMOKE_ORIGIN||'http://127.0.0.1:3110';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true}); const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage(); page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function open(path){await page.goto(origin+path);await page.waitForLoadState('networkidle');await page.locator('#docs-main h1').waitFor();}
try {
 for (const id of ['upload', 'ci']) {
  await open('/docs#' + id);
  await page.waitForFunction(id => {
   const top = document.getElementById(id)?.getBoundingClientRect().top;
   return top !== undefined && top >= -1 && top < innerHeight;
  }, id);
 }
 console.log('PASS direct-entry upload and CI anchors after streaming.');
 await open('/docs'); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Skip to documentation');
 assert.equal(await page.locator('a[href="#docs-main"]').evaluate(e=>getComputedStyle(e).outlineWidth),'3px'); await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'docs-main');
 console.log('PASS keyboard skip link and visible focus.');
 const copy=page.getByRole('button',{name:'Copy Report upload code',exact:true}); await copy.click(); await page.getByRole('status').filter({hasText:'Code copied to clipboard.'}).waitFor();
 const text=(await page.evaluate(()=>navigator.clipboard.readText())).replaceAll('\r','');assert(text.includes('Invoke-RestMethod'));assert(text.includes('runs `\n'));assert(!text.includes('\\u0060')); console.log('PASS actual clipboard and PowerShell continuations.');
 for(const mode of ['denied','unavailable','pending']){
  await open('/docs'); await page.evaluate(mode=>{if(mode==='unavailable') Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});else Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:mode==='denied'?async()=>{throw Error('Denied')}:()=>new Promise(resolve=>{window.finishCopy=resolve;})});},mode);
  await copy.click(); if(mode==='pending'){assert(await copy.isDisabled());assert.equal(await copy.textContent(),'Copying…');await page.evaluate(()=>window.finishCopy());await page.getByRole('status').filter({hasText:'Code copied to clipboard.'}).waitFor();}else await page.getByRole('status').filter({hasText:'Clipboard unavailable. Select and copy the code manually.'}).waitFor();
 }
 console.log('PASS denied, unavailable, and pending clipboard feedback.');
 await open('/docs'); const search=page.getByRole('searchbox').filter({visible:true});
 await search.fill('node version'); const nav=page.getByRole('navigation',{name:'Documentation navigation'}).filter({visible:true});assert(await nav.getByRole('link').count()>0);
 await nav.locator('a[href="/docs/faq#node-version"]').click();await page.waitForLoadState('networkidle');assert(await page.locator('details#node-version').evaluate(e=>e.open));
 const summary=page.locator('details#node-version > summary');await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('details#node-version').evaluate(e=>e.open),false);await page.keyboard.press('Enter');assert(await page.locator('details#node-version').evaluate(e=>e.open));console.log('PASS search deep-link reveal and FAQ keyboard toggles.');
 await open('/docs');await search.fill('nothingmatcheszzzz');await page.getByText('No results match').filter({visible:true}).waitFor();await page.getByRole('button',{name:'Clear filter'}).filter({visible:true}).click();assert.equal(await search.inputValue(),'');
 await page.getByRole('button',{name:'Switch to dark theme'}).click();assert.equal(await page.locator('[data-theme]').getAttribute('data-theme'),'dark');await page.getByRole('button',{name:'Switch to light theme'}).click();console.log('PASS empty search, clear filter, and theme toggle.');
 for(const path of ['/docs','/docs/installation','/docs/commands','/docs/reports','/docs/platform','/docs/troubleshooting','/docs/faq','/docs/errors']){
  await open(path);if(path==='/docs/platform'){assert.equal(await page.locator('#availability ul').evaluate(e=>getComputedStyle(e).listStyleType),'disc');assert.equal(await page.locator('#planned-workflow ol').evaluate(e=>getComputedStyle(e).listStyleType),'decimal');}assert.equal(await page.getByRole('navigation',{name:'Documentation navigation'}).filter({visible:true}).locator('a[aria-current="page"]').getAttribute('href'),path);
  for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${path} ${width}`);}
  await page.setViewportSize({width:1440,height:1000});
 }
 console.log('PASS all eight routes, active navigation, and no page overflow at five widths.');
 await open('/docs');await page.setViewportSize({width:390,height:850});const menu=page.locator('details').filter({has:page.locator('summary', {hasText:'Browse documentation'})}).first();const toggle=menu.locator('summary').first();await toggle.focus();await page.keyboard.press('Enter');assert(await menu.evaluate(e=>e.open));await menu.getByRole('searchbox').fill('CI secrets');await menu.locator('a[href="/docs#ci"]').click();assert.equal(new URL(page.url()).hash,'#ci');assert.equal(await menu.evaluate(e=>e.open),false);assert(await page.locator('#ci').isVisible());console.log('PASS mobile keyboard menu, search, anchor, and automatic close.');
 await page.locator('header').first().click();await page.screenshot({path:'scratch/phase62-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await open('/docs');await page.screenshot({path:'scratch/phase62-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS no browser console or runtime errors.');
} finally {await browser.close();}
