import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { execa } from "execa";
import { awaitReadiness, runtimeSettings, navigateReady, pause } from "../core/readiness.js";
import { discoverExistingServer } from "../core/serverDiscovery.js";
import { PipelineRuntime } from "../pipeline/runtime.js";
import { executeCheck } from "../core/executor.js";
import { concreteRoutes, routeBatches, runBrowserAudit } from "../core/browser.js";
import { isScannerComparable } from "../baseline/compare.js";
import { evaluateCurrentQualityGate } from "../core/report.js";
import { SeoCheck } from "../checks/seo.js";
import type { QAContext } from "../core/context.js";

async function local(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as any).port}`, stop: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
async function project(framework = "node", behavior = "ready") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-readiness-"));
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { start: "node server.cjs", dev: "node server.cjs" }, dependencies: framework === "next" ? { next: "test" } : framework === "angular" ? { "@angular/core": "test" } : {} }));
  await fs.writeFile(path.join(dir, "server.cjs"), `const http=require('http'),fs=require('fs');fs.appendFileSync('starts.txt','started\\n');${behavior === "exit" ? "process.exit(3);" : `http.createServer((req,res)=>{res.statusCode=${behavior === "never" ? 503 : 200};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'intended',status:'ok'}));}).listen(Number(process.env.PORT),'127.0.0.1');`}`);
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}
const fast = { pollingIntervalMs: 20, startupTimeoutMs: 20000, readinessTimeoutMs: 1000 };

for (const delay of [45000, 90000]) test(`Readiness waits ${delay}ms using a controlled clock`, async () => {
  let now = 0, probes = 0;
  const elapsed = await awaitReadiness(async () => { probes++; if (now < delay) throw new Error("Compiling"); }, 300000, 2000, undefined, () => true, { now: () => now, sleep: async ms => { now += ms; } });
  assert.ok(elapsed >= delay); assert.ok(probes > 20); assert.ok(elapsed < delay + 2000);
});
test("Readiness never-ready and exited processes have distinct diagnostics", async () => {
  let now = 0;
  await assert.rejects(awaitReadiness(async () => { throw new Error("503"); }, 100, 20, undefined, () => true, { now: () => now, sleep: async ms => { now += ms; } }), /readiness timed out.*503/);
  await assert.rejects(awaitReadiness(async () => {}, 100, 20, undefined, () => false), /process exited/);
});
test("Developer and CI timing defaults are bounded and separately configurable", () => {
  assert.equal(runtimeSettings().startupTimeoutMs, 300000); assert.equal(runtimeSettings({}, true).startupTimeoutMs, 90000);
  assert.equal(runtimeSettings({ startupTimeoutMs: 45000, scannerTimeoutMs: 7 }).scannerTimeoutMs, 7);
  assert.throws(() => runtimeSettings({ browserConcurrency: 100 })); assert.throws(() => runtimeSettings({ startupTimeoutMs: Infinity }));
});
for (const framework of ["next", "angular"]) test(`Existing verified ${framework} application is reused and remains alive`, async () => {
  const p = await project(framework);
  const s = await local((_, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ app: "intended" })); });
  const runtime = new PipelineRuntime(p.dir, p.dir, { runtime: { ...fast, candidateUrls: [s.url], identity: { path: "/", json: { app: "intended" } } } });
  runtime.routes = async () => [];
  try {
    const selected = await runtime.server(); assert.equal(selected.url, s.url); assert.equal(selected.ownedProcess, false);
    assert.equal(runtime.diagnostics.ownership, "EXTERNAL"); await runtime.stop(); assert.equal((await fetch(s.url)).status, 200);
    assert.equal(await fs.access(path.join(p.dir, "starts.txt")).then(() => true, () => false), false);
  } finally { await runtime.stop(); await s.stop(); await p.cleanup(); }
});
test("Wrong application is rejected and an isolated owned server is cleaned up", async () => {
  const p = await project(); const wrong = await local((_, response) => { response.end('unrelated'); });
  const runtime = new PipelineRuntime(p.dir, p.dir, { runtime: { ...fast, candidateUrls: [wrong.url], identity: { path: "/", json: { app: "intended" } } } });
  runtime.routes = async () => [];
  let selectedUrl = "";
  try {
    selectedUrl = (await runtime.server()).url; assert.notEqual(selectedUrl, wrong.url);
    assert.equal(runtime.diagnostics.ownership, "OWNED"); assert.equal(runtime.diagnostics.rejectedCandidates.length, 1);
    await runtime.stop(); await assert.rejects(fetch(selectedUrl)); assert.equal((await fetch(wrong.url)).status, 200);
  } finally { await runtime.stop(); await wrong.stop(); await p.cleanup(); }
});
test("Explicit wrong identity blocks without starting a second application", async () => {
  const p = await project(); const s = await local((_, res) => res.end('wrong'));
  const runtime = new PipelineRuntime(p.dir, p.dir, { url: s.url, runtime: { ...fast, identity: { path: "/", text: "intended" } } });
  try { await assert.rejects(runtime.server(), /identity/); assert.equal(runtime.diagnostics.state, "BLOCKED"); assert.equal(await fs.access(path.join(p.dir, "starts.txt")).then(() => true, () => false), false); }
  finally { await runtime.stop(); await s.stop(); await p.cleanup(); }
});
test("Explicit identity readiness tolerates transient compilation before reusing the external target", async () => {
  const p = await project(); let probes = 0;
  const s = await local((_, response) => { response.statusCode = ++probes < 3 ? 503 : 200; response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({app:'intended'})); });
  const runtime = new PipelineRuntime(p.dir,p.dir,{url:s.url,runtime:{...fast,identity:{path:'/',json:{app:'intended'}}}});runtime.routes=async()=>[];
  try { assert.equal((await runtime.server()).ownedProcess,false); assert.ok(probes>=3); assert.equal(runtime.diagnostics.ownership,'EXTERNAL'); }
  finally { await runtime.stop(); await s.stop(); await p.cleanup(); }
});
test("Unavailable OS identity evidence cannot validate an occupied port", async () => {
  const p = await project("next"); const s = await local((_, res) => res.end('Next.js'));
  const rejected: { url: string; reason: string }[] = [];
  try { assert.equal(await discoverExistingServer(p.dir, runtimeSettings({ candidateUrls: [s.url] }), rejected, async () => ({ verified: false })), undefined); assert.equal(rejected.length, 1); }
  finally { await s.stop(); await p.cleanup(); }
});
test("API-only readiness accepts a configured non-200 health contract without browser navigation", async () => {
  const p = await project(); const s = await local((req, res) => { res.statusCode = req.url === '/health' ? 204 : 404; res.end(); });
  const runtime = new PipelineRuntime(p.dir, p.dir, { url: s.url, runtime: { ...fast, healthPath: "/health", expectedStatuses: [204] } }); runtime.routes = async () => ["GET /api/items"];
  try { await runtime.server(); assert.equal(runtime.diagnostics.state, "APPLICATION_READY"); }
  finally { await runtime.stop(); await s.stop(); await p.cleanup(); }
});
test("Owned server startup failures and never-ready servers clean their process trees", async () => {
  for (const behavior of ["exit", "never"]) {
    const p = await project("node", behavior); const runtime = new PipelineRuntime(p.dir, p.dir, { runtime: { ...fast, startupTimeoutMs: 30000 } }); runtime.routes = async () => [];
    try { await assert.rejects(runtime.server(), behavior === "exit" ? /PROCESS_EXITED/ : /READINESS_TIMEOUT/); }
    finally { await runtime.stop(); await p.cleanup(); }
  }
});
test("Cancellation interrupts readiness polling immediately", async () => {
  const controller = new AbortController();
  const waiting = awaitReadiness(async () => { throw new Error("not yet"); }, 300000, 2000, controller.signal);
  controller.abort(new Error("Ctrl+C")); await assert.rejects(waiting, /Ctrl\+C/);
});
test("Homepage readiness is separate from compilation retry on another route", async () => {
  const settings = runtimeSettings({ ...fast, compilationRetries: 2 }); let calls = 0;
  const page: any = { goto: async () => { const status = ++calls === 1 ? 503 : 200; return { status: () => status }; }, locator: () => ({ count: async () => 0, innerText: async () => "Ready" }) };
  await navigateReady(page, 'http://localhost/products', settings, false); assert.equal(calls, 2);
});
test("Route retries do not repeat permanent authentication failures", async () => {
  let calls = 0;
  const page: any = { goto: async () => { calls++; return { status: () => 401 }; }, locator: () => ({ count: async () => 0, innerText: async () => "Unauthorized" }) };
  await assert.rejects(navigateReady(page, 'http://localhost/private', runtimeSettings(), false), /authentication/); assert.equal(calls, 1);
});
function context(runtime: any, settings: any = {}): QAContext { return { projectPath: process.cwd(), runtime, config: { runtime: settings }, logger: { result: () => {} } } as any; }
test("SEO evaluation starts after readiness without spending its scanner deadline", async () => {
  const sequence: string[] = [];
  const runtime: any = { prepareCheck: async () => { await pause(40); sequence.push('ready'); }, auditEvidence: () => undefined };
  const result = await executeCheck({ name: "SEO", category: "seo", run: async () => { sequence.push('seo'); return { name: 'SEO', status: 'PASS' as const, score: 100, duration: 0 }; } }, context(runtime, { scannerTimeoutMs: 10 }));
  assert.deepEqual(sequence, ['ready', 'seo']); assert.equal(result.status, 'PASS'); assert.ok(Number(result.metadata?.preparationDurationMs) >= 35); assert.ok(result.duration < 40);
});
test("Static checks execute without starting runtime readiness", async () => {
  const runtime = new PipelineRuntime(process.cwd(), "unused"); let starts = 0; runtime.server = async () => { starts++; throw new Error("not needed"); };
  const result = await executeCheck({ name: 'Code Quality Insights', category: 'code-quality', run: async () => ({ name: 'Code Quality Insights', status: 'PASS' as const, duration: 0 }) }, context(runtime));
  assert.equal(result.status, 'PASS'); assert.equal(starts, 0);
});
test("Infrastructure readiness failure blocks SEO without a fabricated application score", async () => {
  let ran = false;
  const result = await executeCheck({ name: 'SEO', category: 'seo', run: async () => { ran = true; return { name: 'SEO', status: 'PASS' as const, duration: 0 }; } }, context({ prepareCheck: async () => { throw new Error('Server exited'); } }));
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.score, null); assert.equal(ran, false);
});
test("A timed-out route preserves other findings and cannot become a complete PASS", async () => {
  const summary = { eligible: 3, attempted: 3, completed: 2, passed: 2, failed: 0, timedOut: 1, blocked: 0, unverified: 0 };
  const runtime: any = { prepareCheck: async () => {}, auditEvidence: async () => ({ pageSummary: summary, routeAudits: [], seo: [{}, {}] }) };
  const result = await executeCheck({ name: 'SEO', category: 'seo', run: async () => ({ name: 'SEO', status: 'PASS' as const, score: 100, duration: 0 }) }, context(runtime));
  assert.equal(result.status, 'PARTIAL'); assert.equal(result.pagesCompleted, 2); assert.equal(isScannerComparable(result), false);
  assert.equal(evaluateCurrentQualityGate([result], 100).confidence, 'PARTIAL');
});
test("A 200-route project is deduplicated into bounded route batches", async () => {
  const routes = Array.from({ length: 200 }, (_, i) => `/pages/${i + 1}`); const batches = routeBatches([...routes, ...routes], 2);
  assert.equal(batches.length, 100); assert.equal(batches.flat().length, 200); assert.ok(batches.every(batch => batch.length <= 2));
});
test("Parameterized routes stay untested unless concrete representative URLs are supplied", () => {
  assert.deepEqual(concreteRoutes(['/users/:id', '/users/{id}', '/users/[id]', '/users/42', '/users/42']), ['/users/42']);
});
test("Incomplete scopes with confirmed FAIL findings are incomparable to full baselines", () => {
  const result: any = { name: 'Broken Links', status: 'FAIL', score: 80, duration: 1, metadata: { incompleteScope: true } };
  assert.equal(isScannerComparable(result), false); assert.equal(evaluateCurrentQualityGate([result], 80).confidence, 'PARTIAL');
});
test("Configured CI route coverage thresholds fail independently of application findings", () => {
  const result: any = { name:'SEO', status:'PARTIAL', score:100, duration:1, pageSummary:{ eligible:10, completed:8 } };
  const gate = evaluateCurrentQualityGate([result],100,{ runtime:{ minimumRouteCoveragePercent:90 } });
  assert.equal(gate.passed,false); assert.ok(gate.reasons.some(reason=>reason.includes('route coverage 80%')));
});
test("Direct SEO readiness errors are BLOCKED rather than silently NOT_APPLICABLE", async () => {
  const p = await project();
  try { const result = await new SeoCheck(async () => { throw new Error('not ready'); }).run(p.dir); assert.equal(result.status, 'BLOCKED'); assert.equal(result.score, null); }
  finally { await p.cleanup(); }
});

test("Real route audit preserves authenticated routes through compilation retry and another route timeout", async () => {
  const p = await project(); let authorizedLoads = 0, compiling = true;
  const s = await local((request, response) => {
    if (request.headers.authorization !== 'Bearer fixture-test') { response.statusCode = 401; response.end('Unauthorized'); return; }
    authorizedLoads++;
    if (request.url === '/users/42' && compiling) { compiling = false; response.statusCode=503; response.end('Compilation in progress'); return; }
    const reply = () => { response.setHeader('Content-Type','text/html'); response.end('<!doctype html><html lang="en"><head><title>Ready</title></head><body><main><h1>Authenticated user</h1></main></body></html>'); };
    if (request.url === '/slow') setTimeout(reply, 8000).unref(); else reply();
  });
  try {
    const audit = await runBrowserAudit(s.url, ['/slow','/users/42','/users/:id'], p.dir, { headers: { Authorization:'Bearer fixture-test' }, cookies:[] }, runtimeSettings({ initialNavigationTimeoutMs: 800, navigationTimeoutMs: 800, pollingIntervalMs:20, routeTimeoutMs: 10000, compilationRetries:1, browserAuditTimeoutMs:15000 }));
    assert.equal(audit.pageSummary.completed,1); assert.equal(audit.pageSummary.timedOut,1); assert.equal(audit.pageSummary.unverified,1);
    assert.equal(audit.seo[0]?.route,'/users/42'); assert.ok(authorizedLoads>=7);
    assert.equal(audit.network.filter(issue=>/ERR_ABORTED/.test(issue.reason || '')).length,0);
    assert.equal(audit.network.filter(issue=>issue.status===503).length,0);
  } finally { await s.stop(); await p.cleanup(); }
});

test("Ctrl+C lifecycle cancels an owned startup, closes its server and preserves exit 130", async () => {
  const p = await project("next", "never");
  const serverPath = path.join(p.dir,'server.cjs');
  const source = await fs.readFile(serverPath,'utf8');
  await fs.writeFile(serverPath, `require('fs').writeFileSync('owned-process.json',JSON.stringify({pid:process.pid,port:process.env.PORT}));${source}`);
  const script = path.join(p.dir,'cancel-test.mjs');
  const engineUrl = new URL('../core/engine.js', import.meta.url).href;
  await fs.writeFile(script, `import {runQaEngine} from ${JSON.stringify(engineUrl)};process.on('message',()=>process.emit('SIGINT'));const report=await runQaEngine(${JSON.stringify(p.dir)},{profile:'full',ci:true,history:false,html:false,json:false,includeRoutes:['/'],runtime:{startupTimeoutMs:30000,pollingIntervalMs:20}});process.send({runtime:report.runtime,results:report.results.map(r=>({name:r.name,status:r.status}))});`);
  const applicationEnv = { ...process.env };
  delete applicationEnv.NODE_TEST_CONTEXT;
  const child = fork(script,[],{silent:true,execArgv:[],env:applicationEnv});
  let output = '', errors = '';
  let sent = false;
  let failure: unknown;
  child.stdout?.on('data',chunk=>{ output+=chunk.toString(); });
  const cancellationPoll = setInterval(async () => {
    if (!sent && await fs.access(path.join(p.dir,'owned-process.json')).then(()=>true,()=>false)) {
      sent=true; child.send({cancel:true});
    }
  }, 50);
  child.stderr?.on('data',chunk=>{errors+=chunk.toString();});
  try {
    const message: any = await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Cancellation did not complete: ${output}\n${errors}`)),30000);
      child.once('message',message=>{clearTimeout(timer);resolve(message);}); child.once('error',reject);
      child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Child exited before report (${code}): ${output}\n${errors}`));});
    });
    assert.equal(message.runtime.state,'CANCELLED'); assert.ok(message.results.some((result:any)=>result.name==='SEO'&&result.status==='BLOCKED'));
    const owned=JSON.parse(await fs.readFile(path.join(p.dir,'owned-process.json'),'utf8')); await assert.rejects(fetch(`http://127.0.0.1:${owned.port}`));
    const exited = new Promise<number|null>(resolve=>child.once('exit',resolve)); child.disconnect(); assert.equal(await exited,130);
  } catch(error) { failure = new Error(`${error instanceof Error ? error.message : error}\n${output}\n${errors}`); }
  finally {
    clearInterval(cancellationPoll);
    if (child.exitCode===null && child.pid) {
      if(process.platform==='win32') await execa('taskkill',['/pid',String(child.pid),'/T','/F'],{reject:false}); else child.kill();
      await pause(200);
    }
    try { await p.cleanup(); } catch(error) { failure ||= error; }
  }
  if (failure) throw failure;
});
