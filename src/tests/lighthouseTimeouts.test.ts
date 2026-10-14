import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LighthouseCheck,createLighthouseRuntime,type LighthouseRuntime} from '../checks/lighthouse.js';
import {EventEmitter} from 'node:events';
import {loadConfig} from '../core/config.js';
import {lighthouseRouteTimeout,DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS,MAX_LIGHTHOUSE_ROUTE_TIMEOUT_MS} from '../core/lighthouseSettings.js';
import {normalizeCheckResult} from '../core/normalize.js';
import {writeHtmlReport} from '../reporters/html.js';
import {getExitCode} from '../core/exitCode.js';
import {launchLighthouseChrome} from '../core/lighthouseChrome.js';

const lhr=(performance:number|null=1)=>({lhr:{categories:{performance:{score:performance},accessibility:{score:1},seo:{score:1},'best-practices':{score:1}},audits:{}}});
test('worker progress messages do not consume the final Lighthouse result listener',async()=>{
 class FakeWorker extends EventEmitter {constructor(){super();queueMicrotask(()=>this.emit('message',{ready:true}));}postMessage(){queueMicrotask(()=>{this.emit('message',{progress:{phase:'RUNNING',elapsedMs:0}});this.emit('message',{progress:{phase:'AUDITING',elapsedMs:1}});this.emit('message',lhr());});}async terminate(){this.emit('exit',0);return 0;}}
 const api=createLighthouseRuntime(()=>new FakeWorker() as any);await api.prepareAudit!();let timer:ReturnType<typeof setTimeout>;try{const result=await Promise.race([api.audit('http://test.local',{port:1}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Final result listener lost')),200);})]);assert.equal(result?.lhr.categories.performance?.score,1);assert.equal(api.auditProgress!().phase,'AUDITING');}finally{clearTimeout(timer!);await api.cancelAudit!();}
});
function runtime(audit:(url:string)=>Promise<any>,kill=async()=>{}){let launches=0,cancels=0,kills=0;const api={launch:async()=>({port:++launches,pid:launches,kill:async()=>{kills++;await kill();}}),audit,cancelAudit:async()=>{cancels++;},auditProgress:()=>({phase:'Gathering NetworkRecords',events:[{phase:'Gathering NetworkRecords',elapsedMs:5}]})} as unknown as LighthouseRuntime;return{api,counts:()=>({launches,cancels,kills})};}

test('configurable route timeout has a bounded default and rejects invalid values',async()=>{
 assert.equal(lighthouseRouteTimeout(),DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS);assert.equal(lighthouseRouteTimeout(MAX_LIGHTHOUSE_ROUTE_TIMEOUT_MS),120000);
 for(const value of [0,-1,1.5,120001,Infinity,NaN,'45000',null])assert.throws(()=>lighthouseRouteTimeout(value),/lighthouseRouteTimeoutMs/);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lh-config-'));try{await fs.writeFile(path.join(dir,'qa-check.config.json'),JSON.stringify({lighthouseRouteTimeoutMs:60000}));assert.equal(loadConfig(dir).lighthouseRouteTimeoutMs,60000);await fs.writeFile(path.join(dir,'qa-check.config.json'),JSON.stringify({lighthouseRouteTimeoutMs:120001}));assert.throws(()=>loadConfig(dir),/lighthouseRouteTimeoutMs/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('complete successful audits keep scores scoped to actual completed routes and clean up',async()=>{
 const r=runtime(async()=>lhr());const result=await new LighthouseCheck('http://test.local',['/','/contact','/products'],true,1000,r.api,undefined,100).run('.');
 assert.equal(result.status,'PASS');assert.equal(result.pagesCompleted,3);assert.deepEqual(result.data?.map(page=>page.route),['/','/contact','/products']);assert.equal(result.metadata?.scoreScope,'COMPLETED_ROUTES_ONLY');assert.equal(r.counts().kills,1);assert.ok(r.counts().cancels>=1);
});
test('first route timeout preserves reason, cancels worker, replaces Chrome and retains partial scores',async()=>{
 const r=runtime(async url=>new URL(url).pathname==='/'?new Promise(()=>{}):lhr());const result=normalizeCheckResult(await new LighthouseCheck('http://test.local',['/','/contact','/products'],true,1000,r.api,undefined,10).run('.'));
 assert.equal(result.status,'PARTIAL');assert.equal(result.score,100);assert.equal(result.pagesCompleted,2);assert.equal(result.pagesAttempted,3);assert.deepEqual((result.data as any[]).map(page=>page.route),['/contact','/products']);
 const diagnostics=result.metadata?.routeDiagnostics as any[];assert.equal(diagnostics[0].status,'TIMED_OUT');assert.match(diagnostics[0].error,/per-route budget.*Gathering NetworkRecords/);assert.equal(r.counts().kills,2);assert.equal(r.counts().launches,2);assert.ok(r.counts().cancels>=2);
 assert.equal(result.pageSummary?.eligible,3);assert.equal(result.pageSummary?.completed,2);assert.equal(result.pageSummary?.timedOut,1);assert.equal(result.routeAudits?.[0].status,'TIMED_OUT');
 assert.equal(result.issues?.length,1);assert.equal(result.issues?.[0].url,'/');assert.equal(getExitCode({overallScore:100,results:[result]} as any),2);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lh-html-'));try{const report={version:2,projectPath:dir,framework:'React',pipeline:'React',checksExecuted:[result.name],checksSkipped:[],routes:['/','/contact','/products'],startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),duration:1,overallScore:100,results:[result]} as any;const html=await fs.readFile(await writeHtmlReport(report,dir),'utf8');assert.match(html,/Route execution diagnostics/);assert.match(html,/TIMED_OUT/);assert.match(html,/per-route budget/);assert.match(html,/Scores below apply only to completed routes/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('initialization is bounded separately and does not consume the first route deadline',async()=>{
 const r=runtime(async()=>lhr());r.api.prepareAudit=async()=>{await new Promise(resolve=>setTimeout(resolve,20));};const result=await new LighthouseCheck('http://test.local',['/'],true,1000,r.api,undefined,5).run('.');assert.equal(result.status,'PASS');assert.ok((result.metadata?.initializationDiagnostics as any[])[0].durationMs>=15);
});
test('total budget exhaustion preserves unattempted routes and no synthetic page scores',async()=>{
 const r=runtime(async url=>new URL(url).pathname==='/'?lhr():new Promise(()=>{}));const result=await new LighthouseCheck('http://test.local',['/','/contact','/products'],true,30,r.api,undefined,100).run('.');assert.equal(result.status,'PARTIAL');assert.deepEqual(result.metadata?.unattemptedRoutes,['/products']);assert.equal(result.data?.length,1);assert.match((result.metadata?.routeDiagnostics as any[])[1].error,/total budget/);
});
test('cleanup failure does not mask a route timeout or mark completed scores as a complete pass',async()=>{
 const r=runtime(async url=>new URL(url).pathname==='/'?lhr():new Promise(()=>{}),async()=>{throw Error('Chrome still locked');});const result=await new LighthouseCheck('http://test.local',['/','/contact','/products'],true,1000,r.api,undefined,10).run('.');assert.equal(result.status,'PARTIAL');assert.equal((result.metadata?.routeDiagnostics as any[])[1].status,'TIMED_OUT');assert.equal(result.metadata?.stopReason,'CLEANUP_FAILED');assert.match(result.message!,/cleanup incomplete/);assert.deepEqual(result.metadata?.unattemptedRoutes,['/products']);
});
test('missing performance scores cannot produce PASS from other routes scores',async()=>{
 const r=runtime(async url=>lhr(new URL(url).pathname==='/'?null:1));const result=await new LighthouseCheck('http://test.local',['/','/contact'],true,1000,r.api).run('.');assert.equal(result.status,'PARTIAL');assert.equal(result.data?.[0].performance,null);assert.equal(result.score,100);
});
test('genuine route errors preserve PARTIAL evidence when another route completed',async()=>{
 const r=runtime(async url=>{if(new URL(url).pathname==='/')throw Error('Navigation failed');return lhr();});const result=await new LighthouseCheck('http://test.local',['/','/contact'],true,1000,r.api).run('.');assert.equal(result.status,'PARTIAL');assert.match((result.metadata?.routeDiagnostics as any[])[0].error,/Navigation failed/);assert.equal(result.pagesCompleted,1);
});
test('Lighthouse runtimeError is a route failure with no fabricated score',async()=>{
 const r=runtime(async url=>new URL(url).pathname==='/'?{...lhr(),lhr:{...lhr().lhr,runtimeError:{code:'NO_FCP',message:'No contentful paint'}}}:lhr());const result=await new LighthouseCheck('http://test.local',['/','/contact'],true,1000,r.api).run('.');assert.equal(result.status,'PARTIAL');assert.equal(result.pagesCompleted,1);assert.deepEqual(result.data?.map(page=>page.route),['/contact']);assert.match((result.metadata?.routeDiagnostics as any[])[0].error,/NO_FCP/);
});
test('worker initialization timeout retains all untested routes and cleans owned resources',async()=>{
 const r=runtime(async()=>lhr());r.api.prepareAudit=async()=>new Promise(()=>{});const result=await new LighthouseCheck('http://test.local',['/','/contact'],true,20,r.api).run('.');assert.equal(result.status,'TIMEOUT');assert.equal(result.pagesAttempted,0);assert.equal(result.pagesCompleted,0);assert.deepEqual(result.metadata?.unattemptedRoutes,['/','/contact']);assert.equal(result.pageSummary?.unverified,2);assert.equal(r.counts().kills,1);assert.ok(r.counts().cancels>=1);
});
test('real owned Chrome cleanup closes the process, removes its profile and is idempotent',async()=>{
 const chrome=await launchLighthouseChrome({chromeFlags:['--headless','--no-sandbox','--disable-gpu']});const argument=chrome.process.spawnargs.find(value=>value.startsWith('--user-data-dir='));assert.ok(argument);const profile=argument!.slice('--user-data-dir='.length);
 try{await chrome.kill();await chrome.kill();assert.throws(()=>process.kill(chrome.pid,0),/ESRCH/);await assert.rejects(fs.access(profile));}finally{await chrome.kill();}
});
