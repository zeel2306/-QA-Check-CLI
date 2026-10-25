import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import axe from 'axe-core';
import { inspectFormLabels } from '../core/formLabels.js';
import { LighthouseCheck, type LighthouseRuntime } from '../checks/lighthouse.js';

test('optional form-label policy distinguishes association, visibility and axe naming', async () => {
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent(`<html lang="en"><title>Labels</title><body><main><h1>Labels</h1>
  <input id="placeholder" placeholder="Email"><input id="aria" aria-label="Email">
  <label for="explicit">Name</label><input id="explicit">
  <label>Wrapped<input id="wrapped"></label>
  <span id="caption">Select</span><select id="referenced" aria-labelledby="caption"><option>A</option></select>
  <label for="hiddenLabel" style="display:none">Hidden label</label><input id="hiddenLabel">
  <input id="invisible" type="hidden"><input id="dangling" aria-labelledby="absent"><label for="empty"></label><input id="empty">
  </main></body></html>`);
  assert.deepEqual(await inspectFormLabels(page,'/'),[]);
  const associated=await inspectFormLabels(page,'/','associated');
  assert.deepEqual(associated.map(i=>i.selector).sort(),['#aria','#dangling','#empty','#placeholder']);
  const visible=await inspectFormLabels(page,'/','visible');
  assert.deepEqual(visible.map(i=>i.selector).sort(),['#aria','#dangling','#empty','#hiddenLabel','#placeholder']);
  assert.ok(visible.every(i=>i.type==='form-label-policy-visible'&&i.message.includes('separate from axe')));
  await page.addScriptTag({content:axe.source});
  const violations=await page.evaluate(async()=> (await (globalThis as any).axe.run(document,{runOnly:['label']})).violations);
  assert.ok(!violations.some((v:any)=>v.nodes.some((n:any)=>n.target.includes('#placeholder')||n.target.includes('#aria'))));
  await page.setContent('<div style="opacity:0"><input></div><form><div><input></div><div><input></div></form><form><input></form>');
  const repeatedControls=await inspectFormLabels(page,'/','visible');
  assert.equal(repeatedControls.length,3);
  assert.equal(new Set(repeatedControls.map(i=>i.selector)).size,3);
  for(const issue of repeatedControls)assert.equal(await page.locator(issue.selector!).count(),1);
 } finally { await browser.close(); }
});

const report={lhr:{categories:{performance:{score:.8},accessibility:{score:1},seo:{score:1},'best-practices':{score:1}},audits:{}}};
test('Lighthouse reports selected targets rather than full route inventory',async()=>{
 const runtime={launch:async()=>({port:1,kill:async()=>{}}),audit:async()=>report} as unknown as LighthouseRuntime;
 const result=await new LighthouseCheck('http://localhost',['/','/products/1','/products/2'],false,1000,runtime).run('.');
 assert.equal(result.pagesDiscovered,2); assert.equal(result.pagesCompleted,2);
 assert.equal(result.metadata?.inventoryRoutes,3); assert.equal(result.metadata?.stopReason,'COMPLETED');
});
test('Lighthouse total budget retains partial evidence and identifies unattempted routes',async()=>{
 let calls=0;
 const runtime={launch:async()=>({port:1,kill:async()=>{}}),audit:async()=>{if(calls++===0)return report;return new Promise(()=>{});},cancelAudit:async()=>{}} as unknown as LighthouseRuntime;
 const result=await new LighthouseCheck('http://localhost',['/','/about','/help'],false,50,runtime).run('.');
 assert.equal(result.status,'PARTIAL');assert.equal(result.pagesCompleted,1);
 assert.equal(result.metadata?.stopReason,'TOTAL_BUDGET_EXHAUSTED');assert.deepEqual(result.metadata?.unattemptedRoutes,['/help']);
});
test('Lighthouse route timeout cancels job, replaces Chrome, and continues without hiding failure',async()=>{
 let calls=0,launches=0,kills=0,cancelled=0;
 const runtime={launch:async()=>{launches++;return{port:launches,kill:async()=>{kills++;}};},audit:async()=>{if(calls++===0)return new Promise(()=>{});return report;},cancelAudit:async()=>{cancelled++;}} as unknown as LighthouseRuntime;
 const result=await new LighthouseCheck('http://localhost',['/','/about'],false,1000,runtime,undefined,10).run('.');
 assert.equal(result.status,'PARTIAL');assert.equal(result.pagesAttempted,2);assert.equal(result.pagesCompleted,1);
 assert.equal((result.metadata?.routeDiagnostics as any[])[0].status,'TIMED_OUT');assert.equal(launches,2);assert.equal(kills,2);assert.ok(cancelled>=2);
});
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../core/config.js';
import { AccessibilityCheck } from '../checks/accessibility.js';

test('form label policy is explicit and valid configured Lighthouse allocation is preserved',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'qa-followup-config-'));
 try {
  await fs.writeFile(path.join(directory,'qa-check.config.json'),JSON.stringify({formLabelPolicy:'associated',lighthouseBudgetMs:240000}));
  assert.equal(loadConfig(directory).formLabelPolicy,'associated');assert.equal(loadConfig(directory).lighthouseBudgetMs,240000);
  await fs.writeFile(path.join(directory,'qa-check.config.json'),JSON.stringify({formLabelPolicy:true}));
  assert.equal(loadConfig(directory).formLabelPolicy,undefined);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('static form review does not claim placeholder or implicit labels fail axe naming',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'qa-followup-static-'));
 try {
  await fs.writeFile(path.join(directory,'index.html'),'<html lang="en"><body><input placeholder="Email"><label>Name<input></label><input aria-label="Last name"></body></html>');
  const result=await new AccessibilityCheck().run(directory);
  assert.equal(result.status,'PASS');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('Lighthouse recovery failure retains eligible targets and its explicit error',async()=>{
 let launches=0;
 const runtime={launch:async()=>{if(launches++)throw Error('Recovery launch failed');return{port:1,kill:async()=>{}};},audit:async()=>new Promise(()=>{}),cancelAudit:async()=>{}} as unknown as LighthouseRuntime;
 const result=await new LighthouseCheck('http://localhost',['/','/about'],false,1000,runtime,undefined,10).run('.');
 assert.equal(result.status,'TIMEOUT');assert.equal(result.pagesDiscovered,2);
 assert.equal(result.metadata?.stopReason,'RECOVERY_FAILED');
 assert.deepEqual(result.metadata?.recoveryErrors,['Recovery launch failed']);
 assert.deepEqual(result.metadata?.unattemptedRoutes,['/about']);
});
