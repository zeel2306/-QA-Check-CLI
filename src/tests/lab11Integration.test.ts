import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { eslintArguments } from '../lint.js';
import { BrokenImagesCheck } from '../checks/brokenImages.js';
import { discoverRoutes } from '../crawler.js';
import { LighthouseCheck, type LighthouseRuntime } from '../checks/lighthouse.js';
import { getExitCode } from '../core/exitCode.js';
import { hasBuiltViteOutput } from '../core/runner.js';
import { CommandCheck } from '../checks/command.js';
import { writeHtmlReport } from '../reporters/html.js';
async function fixture(){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'qa-lab11-'));await fs.mkdir(path.join(directory,'src'));return{directory,cleanup:()=>fs.rm(directory,{recursive:true,force:true})};}
test('HTML retains tooling diagnostics and separates unverified images from confirmed findings',async()=>{
 const f=await fixture();try{const report={version:2,projectPath:f.directory,framework:'React',pipeline:'React',checksExecuted:[],checksSkipped:[],routes:['/'],startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),duration:1,overallScore:100,runtime:{state:'STOPPED',transitions:[],startupDurationMs:0,readinessDurationMs:0,rejectedCandidates:[],fallbackRoutes:['/*']},results:[{name:'Lighthouse Performance',status:'PARTIAL',duration:1,data:[{route:'/',performance:62,accessibility:100}],metadata:{toolingDiagnostics:[{message:'Failed to parse source map <script>probe</script>'}]}},{name:'Broken Images',status:'PASS',duration:1,metadata:{unverifiedSourceCandidates:[{url:'/missing-banner.png'}]},data:{issues:[]}}]} as any;const html=await fs.readFile(await writeHtmlReport(report,f.directory),'utf8');assert.match(html,/Audited page scores/);assert.ok(!html.includes('Missing Alt'));assert.match(html,/Tooling diagnostics/);assert.match(html,/Unverified source references/);assert.match(html,/Fallback Route Declarations/);assert.match(html,/&lt;script&gt;probe&lt;\/script&gt;/);assert.ok(!html.includes('<script>probe</script>'));}finally{await f.cleanup();}
});
test('Vite source entry is not a compiled preview build',async()=>{
 const f=await fixture();try{await fs.writeFile(path.join(f.directory,'index.html'),'<script type="module" src="/src/main.tsx"></script>');assert.equal(hasBuiltViteOutput(f.directory),false);await fs.mkdir(path.join(f.directory,'dist'));await fs.writeFile(path.join(f.directory,'dist','index.html'),'<script src="/assets/app.js"></script>');assert.equal(hasBuiltViteOutput(f.directory),true);}finally{await f.cleanup();}
});
test('ESLint directory expansion preserves warning gates',async()=>{
 const f=await fixture();try{await fs.writeFile(path.join(f.directory,'package.json'),JSON.stringify({scripts:{lint:'eslint . --max-warnings 0'}}));await fs.writeFile(path.join(f.directory,'src','app.ts'),'export {};');assert.deepEqual(await eslintArguments(f.directory),['src/app.ts','--max-warnings','0']);}finally{await f.cleanup();}
});
test('ESLint exit 2 remains ERROR even when partial structured findings exist',async()=>{
 const finding={ruleId:'no-debugger',severity:2,message:'Unexpected debugger'};
 for(const exitCode of [1,2]){const result=await new CommandCheck('ESLint',async()=>({success:false,exitCode,stdout:'',stderr:exitCode===2?'Configuration failure':'',errorCount:1,warningCount:0,totalIssues:1,issues:[finding]})).run('.');assert.equal(result.status,exitCode===1?'FAIL':'ERROR');assert.deepEqual(result.issues,[finding]);}
});
test('ESLint preserves direct TS script targets and gates, strips mutation/output flags',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.directory,'package.json'),JSON.stringify({scripts:{lint:'eslint "src/**/*.{ts,tsx}" --max-warnings 0 --fix --format stylish --output-file lint.txt'}}));
  assert.deepEqual(await eslintArguments(f.directory),['src/**/*.{ts,tsx}','--max-warnings','0']);
 }finally{await f.cleanup();}
});
test('ESLint discovers TS and TSX explicitly when no direct lint script is usable',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.directory,'src','main.tsx'),'export {};');await fs.writeFile(path.join(f.directory,'src','state.ts'),'export {};');
  await fs.mkdir(path.join(f.directory,'dist'));await fs.writeFile(path.join(f.directory,'dist','generated.js'),'debugger;');
  assert.deepEqual(await eslintArguments(f.directory),['src/main.tsx','src/state.ts']);
 }finally{await f.cleanup();}
});
const audit=(broken:boolean)=>({seo:[{route:'/'}],images:[{route:'/',url:broken?'http://localhost/missing-banner.png':'http://localhost/logo.svg',broken}],imageResponses:{'http://localhost/logo.svg':200,'http://localhost/missing-banner.png':404}} as any);
for(const active of [false,true])test(`Conditional missing JSX image is confirmed only when rendered: active=${active}`,async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.directory,'src','main.tsx'),`const view=<img src={enabled ? '/missing-banner.png' : '/logo.svg'}/>;`);
  const result=await new BrokenImagesCheck(async()=>audit(active)).run(f.directory);
  assert.equal(result.status,active?'FAIL':'PASS');assert.equal((result.data as any).issues.length,active?1:0);
  if(!active)assert.ok((result.metadata?.unverifiedSourceCandidates as any[]).some(i=>i.url==='/missing-banner.png'));
 }finally{await f.cleanup();}
});
test('Conditional image reference without runtime evidence is PARTIAL rather than confirmed FAIL or clean PASS',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.directory,'src','main.tsx'),`const view=flag && <img src='/missing.png'/>;`);
  const result=await new BrokenImagesCheck().run(f.directory);assert.equal(result.status,'PARTIAL');assert.equal(result.score,null);assert.equal((result.data as any).issues.length,0);
 }finally{await f.cleanup();}
});
test('React not-found wildcard is retained as fallback metadata, not a fourth page; real dynamic routes remain inventoried',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.directory,'package.json'),JSON.stringify({dependencies:{react:'18',vite:'5'}}));
  await fs.writeFile(path.join(f.directory,'src','main.tsx'),'<Route path="/"/><Route path="/contact"/><Route path="/products"/><Route path="*"/><Route path="/users/:id"/>');
  const result=await discoverRoutes(f.directory);assert.deepEqual(result.fallbackRoutes,['/*']);assert.ok(!result.routes.includes('/*'));assert.ok(result.routes.includes('/users/:id'));assert.equal(result.routes.length,4);
 }finally{await f.cleanup();}
});
test('Lighthouse source-map diagnostics retain stack and make numeric results PARTIAL',async()=>{
 const runtime={launch:async()=>({port:1,kill:async()=>{}}),audit:async()=>({diagnostics:['Failed to parse source map TypeError: bad mappings'],lhr:{categories:{performance:{score:1}},audits:{}}})} as unknown as LighthouseRuntime;
 const result=await new LighthouseCheck('http://localhost',['/'],false,1000,runtime).run('.');assert.equal(result.status,'PARTIAL');assert.equal(result.pagesCompleted,1);assert.equal(result.score,100);
 assert.equal((result.metadata?.toolingDiagnostics as any[])[0].code,'SOURCE_MAP_PARSE_FAILED');assert.match(result.message!,/mapping-dependent evidence is incomplete/);
});
test('Lighthouse genuine audit failure remains ERROR, not a source-map-only warning',async()=>{
 const runtime={launch:async()=>({port:1,kill:async()=>{}}),audit:async()=>{throw Error('Navigation failed');}} as unknown as LighthouseRuntime;
 const result=await new LighthouseCheck('http://localhost',['/'],false,1000,runtime).run('.');assert.equal(result.status,'ERROR');assert.equal(result.score,null);
});
test('CI gate uses nonzero exit codes for incomplete execution while explicit failOn none remains opt-out',()=>{
 for(const status of ['FAIL','ERROR','PARTIAL','TIMEOUT','BLOCKED']){const report={overallScore:100,results:[{name:'Test',status}]} as any;assert.equal(getExitCode(report),2);assert.equal(getExitCode(report,'none'),0);}
 assert.equal(getExitCode({overallScore:100,results:[{status:'PASS'}]} as any),0);
 assert.equal(getExitCode({overallScore:100,results:[{status:'WARNING'}]} as any,'warning'),1);
});

