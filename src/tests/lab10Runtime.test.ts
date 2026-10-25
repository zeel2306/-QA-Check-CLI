import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { loadConfig } from "../core/config.js";
import { runBuild } from "../build.js";
import { runLint } from "../lint.js";
import { CommandCheck } from "../checks/command.js";
import { PipelineRuntime, LazyApiTestingCheck } from "../pipeline/runtime.js";
import { startLocalServer } from "../core/runner.js";
import { runtimeSettings } from "../core/readiness.js";
import { assessScoreEvidence, evaluateCurrentQualityGate } from "../core/report.js";
import { createHistorySnapshot, createHistoryTrend } from "../history.js";
import { compareWithBaseline } from "../baseline/compare.js";
import { runQaEngine } from "../core/engine.js";
import { writeHtmlReport } from "../reporters/html.js";

async function fixture() {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"qa-lab10-test-"));
  return {dir,cleanup:()=>fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200})};
}
async function serve(handler:http.RequestListener) {
  const server=http.createServer(handler);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {url:`http://127.0.0.1:${(server.address() as any).port}`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
}
const apiCase={name:"Health",url:"http://localhost:4100/api/health",expect:{status:200,responseTime:1000}};
for(const bom of [false,true]) test(`Configuration preserves API cases with UTF-8 BOM=${bom}`,async()=>{
  const p=await fixture();
  try {await fs.writeFile(path.join(p.dir,"qa-check.config.json"),(bom?"\uFEFF":"")+JSON.stringify({api:[apiCase]}));assert.deepEqual(loadConfig(p.dir).apiTestCases?.map(c=>[c.name,c.url,c.expect?.status]),[[apiCase.name,apiCase.url,200]]);}
  finally{await p.cleanup();}
});
test("Frontend inherits its immediate package root configuration",async()=>{
  const p=await fixture();
  try {await fs.mkdir(path.join(p.dir,"frontend"));await fs.writeFile(path.join(p.dir,"package.json"),"{}");await fs.writeFile(path.join(p.dir,"qa-check.config.json"),JSON.stringify({api:[apiCase]}));assert.equal(loadConfig(path.join(p.dir,"frontend")).apiTestCases?.length,1);}
  finally{await p.cleanup();}
});
test("Fullstack package root selects its unique frontend and retains API configuration",async()=>{
  const p=await fixture();
  try{
    await fs.writeFile(path.join(p.dir,"package.json"),"{}");await fs.writeFile(path.join(p.dir,"qa-check.config.json"),JSON.stringify({api:[apiCase]}));
    const frontend=path.join(p.dir,"frontend");await fs.mkdir(path.join(frontend,"app"),{recursive:true});await fs.writeFile(path.join(frontend,"package.json"),JSON.stringify({dependencies:{next:"test"}}));await fs.writeFile(path.join(frontend,"app/page.tsx"),"export default function Home(){return <h1>Home</h1>}");
    const report=await runQaEngine(p.dir,{profile:"fast",html:false,json:false,pdf:false,history:false});assert.equal(report.framework,"Next.js");assert.equal(report.projectPath,frontend);assert.equal(report.results.find(result=>result.name==="API Testing")?.status,"SKIPPED");
  }finally{await p.cleanup();}
});
test("BOM is accepted in standalone API manifests",async()=>{
  const p=await fixture();try{await fs.writeFile(path.join(p.dir,"api-cases.json"),"\uFEFF"+JSON.stringify([apiCase]));assert.equal(loadConfig(p.dir).apiTestCases?.length,1);}finally{await p.cleanup();}
});
test("Next build cannot overwrite a live dev cache or source configuration",async()=>{
  const p=await fixture();
  const server=await serve(async(_,res)=>res.end(await fs.readFile(path.join(p.dir,".next","dev-marker"),"utf8")));
  try{
    await fs.mkdir(path.join(p.dir,"node_modules"));await fs.mkdir(path.join(p.dir,".next"));
    await fs.writeFile(path.join(p.dir,".next","dev-marker"),"running dev cache");
    await fs.writeFile(path.join(p.dir,"tsconfig.json"),"{}");await fs.writeFile(path.join(p.dir,"next.config.js"),"module.exports={reactStrictMode:true}");
    await fs.writeFile(path.join(p.dir,"package.json"),JSON.stringify({dependencies:{next:"test"},scripts:{build:"node build.cjs"}}));
    await fs.writeFile(path.join(p.dir,"build.cjs"),"const fs=require('fs');fs.mkdirSync('.next',{recursive:true});fs.writeFileSync('.next/dev-marker','production cache');fs.writeFileSync('tsconfig.json','compiler changed config');");
    const result=await runBuild(p.dir);assert.equal(result.success,true);
    assert.equal(await (await fetch(server.url)).text(),"running dev cache");assert.equal(await fs.readFile(path.join(p.dir,"tsconfig.json"),"utf8"),"{}");
    assert.equal(await fs.readFile(path.join(p.dir,"next.config.js"),"utf8"),"module.exports={reactStrictMode:true}");
  }finally{await server.close();await p.cleanup();}
});
for(const data of [
  {success:false,exitCode:1,stdout:"",stderr:"command failed"},
  {success:false,exitCode:1,stdout:'How would you like to configure ESLint?',stderr:""},
  {success:true,exitCode:0,stdout:'How would you like to configure ESLint?',stderr:""},
]) test(`ESLint has no false PASS for exit=${data.exitCode}, prompt=${!!data.stdout}`,async()=>{
  const result=await new CommandCheck("ESLint",async()=>({...data,totalIssues:0,issues:[]})).run("");
  assert.equal(result.status,"ERROR");assert.equal(result.score,null);assert.equal(result.issues?.length,0);
});
test("Missing Next ESLint config never invokes interactive next lint",async()=>{
  const p=await fixture();try{await fs.writeFile(path.join(p.dir,"package.json"),JSON.stringify({dependencies:{next:"test"}}));const data=await runLint(p.dir);assert.equal(data.exitCode,-1);assert.equal(data.success,false);assert.equal((await new CommandCheck("ESLint",async()=>data).run(p.dir)).status,"NOT_APPLICABLE");}finally{await p.cleanup();}
});
test("Persistent HTTP 500 ends readiness promptly and names the exact GET URL",async()=>{
  let requests=0;const server=await serve((_,res)=>{requests++;res.statusCode=500;res.end("runtime failure");});
  try{const began=Date.now();await assert.rejects(startLocalServer(process.cwd(),server.url,{settings:runtimeSettings({readinessTimeoutMs:300000,pollingIntervalMs:20}),signal:undefined}),error=>String(error).includes(`GET ${server.url}/`)&&String(error).includes("3 consecutive"));assert.equal(requests,3);assert.ok(Date.now()-began<5000);}finally{await server.close();}
});
test("Transient HTTP 503 can recover within its independent readiness budget",async()=>{
  let requests=0;const server=await serve((_,res)=>{res.statusCode=++requests<4?503:200;res.end();});
  try{const result=await startLocalServer(process.cwd(),server.url,{settings:runtimeSettings({readinessTimeoutMs:5000,pollingIntervalMs:20})});assert.equal(result.ownedProcess,false);assert.equal(requests,4);}finally{await server.close();}
});
test("A GET 404 readiness route cannot be mistaken for a healthy homepage or retried for five minutes",async()=>{
  const methods:string[]=[];const server=await serve((req,res)=>{methods.push(req.method!);res.statusCode=404;res.end();});
  try{await assert.rejects(startLocalServer(process.cwd(),server.url,{settings:runtimeSettings()}),/GET.*HTTP 404.*missing/);assert.deepEqual(methods,["GET"]);}finally{await server.close();}
});
test("Persistent identity HTTP 500 also stops early and preserves the external server",async()=>{
  let requests=0;const server=await serve((_,res)=>{requests++;res.statusCode=500;res.end();});
  const runtime=new PipelineRuntime(process.cwd(),"unused",{url:server.url,runtime:{pollingIntervalMs:20,identity:{path:"/api/health",json:{status:"ok"}}}});
  try{await assert.rejects(runtime.server(),/Identity GET.*HTTP 500.*persistent/);assert.equal(requests,3);assert.equal(runtime.diagnostics.cleanup,"EXTERNAL_PRESERVED");assert.equal((await fetch(server.url)).status,500);}finally{await server.close();}
});
test("Absolute report directories stay absolute instead of being joined onto the project",async()=>{
  const p=await fixture();const output=await fixture();
  try{await fs.writeFile(path.join(p.dir,"index.html"),"<html><body>fixture</body></html>");await runQaEngine(p.dir,{profile:"fast",output:output.dir,history:false,pdf:false,json:true,html:true});assert.equal(JSON.parse(await fs.readFile(path.join(output.dir,"report.json"),"utf8")).projectPath,p.dir);}finally{await p.cleanup();await output.cleanup();}
});
test("Absolute API targets execute despite frontend failure and preserve expected failures",async()=>{
  const server=await serve((req,res)=>{res.setHeader("Content-Type","application/json");res.statusCode=req.method==="POST"?201:200;res.end('{"status":"ok"}');});
  const runtime=new PipelineRuntime(process.cwd(),"unused",{apiTestCases:[{name:"Health",url:server.url},{name:"Invalid product",url:server.url,method:"POST",body:{price:-1},expect:{status:422}}]});
  runtime.server=async()=>{throw new Error("Frontend unavailable");};
  try{await runtime.prepareCheck("API Testing");const result=await new LazyApiTestingCheck(runtime).run(process.cwd());assert.equal(result.data && (result.data as any).total,2);assert.equal((result.data as any).failed,1);assert.equal(result.status,"FAIL");}finally{await server.close();}
});
test("Full engine loads root config and runs API when the frontend stays HTTP 500",async()=>{
  const p=await fixture();const frontend=await serve((_,res)=>{res.statusCode=500;res.end("broken frontend");});const backend=await serve((_,res)=>{res.setHeader("Content-Type","application/json");res.end('{"status":"ok"}');});
  try{
    await fs.writeFile(path.join(p.dir,"package.json"),JSON.stringify({dependencies:{next:"test"}}));await fs.mkdir(path.join(p.dir,"app"));await fs.writeFile(path.join(p.dir,"app","page.tsx"),"export default function Home(){return <h1>Home</h1>}");
    await fs.writeFile(path.join(p.dir,"qa-check.config.json"),"\uFEFF"+JSON.stringify({api:[{name:"Health",url:backend.url}]}));
    const report=await runQaEngine(p.dir,{url:frontend.url,profile:"full",html:false,json:false,pdf:false,history:false,runtime:{pollingIntervalMs:20},includeRoutes:["/"]});
    assert.equal(report.results.find(result=>result.name==="SEO")?.status,"BLOCKED");assert.equal(report.results.find(result=>result.name==="API Testing")?.status,"PASS");assert.equal(report.scoreEvidence?.status,"PROVISIONAL");assert.equal(report.currentQualityGate?.passed,false);
  }finally{await frontend.close();await backend.close();await p.cleanup();}
});
function report(results:any[],score=100):any{return{version:2,projectPath:"fixture",pipeline:"Next.js",framework:"Next.js",routes:["/"],results,overallScore:score,finishedAt:new Date().toISOString(),startedAt:new Date().toISOString(),duration:1,checksExecuted:[],checksSkipped:[]};}
test("Incomplete scores are provisional and empty evidence has no observed score",()=>{
  const results:any[]=[{name:"Build",status:"PASS",duration:1},{name:"SEO",status:"BLOCKED",duration:1}];assert.equal(assessScoreEvidence(results,100).status,"PROVISIONAL");assert.equal(assessScoreEvidence(results.slice(1),100).observedScore,null);
  assert.equal(evaluateCurrentQualityGate([{name:"SEO",status:"PARTIAL",duration:1,score:100}],100).passed,false);
});
test("Blocked history cannot imply improvement or fixed defects; full identical scopes can compare",()=>{
  const previous=report([{name:"SEO",status:"FAIL",score:68,duration:1,metadata:{scopeKey:"a"},data:{issues:[{type:"title",route:"/"}]}}],68);
  const current=report([{name:"SEO",status:"BLOCKED",duration:1}],100);
  const trend=createHistoryTrend(current,[createHistorySnapshot(previous)]);assert.equal(trend?.comparable,false);assert.equal(trend?.scoreDelta,undefined);assert.equal(trend?.issueDelta,undefined);
  const baseline=compareWithBaseline(current,previous)!;assert.equal(baseline.categorizedIssues.fixedIssues.length,0);assert.equal(baseline.overallScore.delta,0);assert.equal(baseline.qualityGate.passed,false);
  const full=createHistoryTrend(previous,[createHistorySnapshot(previous)]);assert.equal(full?.scoreDelta,0);assert.equal(full?.comparable,true);
  const changed=report([{...previous.results[0],metadata:{scopeKey:"b"}}],100);assert.equal(createHistoryTrend(changed,[createHistorySnapshot(previous)])?.scoreDelta,undefined);
});
test("HTML visibly labels provisional quality and incomparable history",async()=>{
  const p=await fixture();try{const current=report([{name:"SEO",status:"BLOCKED",duration:1}]);current.projectPath=p.dir;current.history=createHistoryTrend(current,[{...createHistorySnapshot(current),overallScore:68}]);const file=await writeHtmlReport(current,p.dir);const html=await fs.readFile(file,"utf8");assert.match(html,/INCOMPLETE AUDIT/);assert.match(html,/INSUFFICIENT_EVIDENCE/);assert.match(html,/INCOMPARABLE/);}finally{await p.cleanup();}
});
