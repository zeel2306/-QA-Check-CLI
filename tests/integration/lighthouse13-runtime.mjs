// Explicit runtime paths avoid accidentally testing a globally installed QA CLI.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolveNpmCli, isOutsideDirectory} from './lab13-support.mjs';
const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const runtimes=process.argv.slice(2);
assert.equal(runtimes.length,3,'Usage: node tests/integration/lighthouse13-runtime.mjs <node22.19+ executable> <node24 executable> <node20 executable>');
const npm=await resolveNpmCli();
const output=path.join(root,'test-reports/lighthouse13-runtime');
await fs.mkdir(output,{recursive:true});
const parent=await fs.realpath(os.tmpdir());
const work=await fs.mkdtemp(path.join(parent,'qa-lh13-runtime-'));
assert.ok(isOutsideDirectory(root,work),'Consumer must be outside source checkout');
const env={...process.env,NODE_OPTIONS:'',NODE_PATH:''};
const records=[];
let commandNumber=0;
function run(node,args,cwd=work){
 const started=Date.now();const r=spawnSync(node,args,{cwd,env,encoding:'utf8',timeout:300000});
 const result={code:r.status??-1,stdout:r.stdout??'',stderr:(r.stderr??'')+(r.error?'\n'+r.error.stack:'')};
 fsSync.writeFileSync(path.join(output,`command-${++commandNumber}.json`),JSON.stringify({node,args,cwd,startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,signal:r.signal,error:r.error?{code:r.error.code,message:r.error.message}:null,...result},null,2));
 return result;
}
try{
 const packed=run(process.execPath,[npm,'pack',root,'--ignore-scripts','--json','--pack-destination',work]);
 assert.equal(packed.code,0,packed.stderr);const [manifest]=JSON.parse(packed.stdout);
 await fs.writeFile(path.join(output,'package-manifest.json'),JSON.stringify(manifest,null,2));
 for(const [index,node] of runtimes.entries()){
  const runtime=run(node,['-p','process.versions.node']);assert.equal(runtime.code,0);const version=runtime.stdout.trim();
  assert.equal(Number(version.split('.')[0]),[22,24,20][index]);
  const consumer=path.join(work,`consumer ${index}`);await fs.mkdir(consumer);await fs.writeFile(path.join(consumer,'package.json'),'{"private":true}');
  const install=run(node,[npm,'install','--ignore-scripts','--no-audit','--no-fund','--prefer-offline',...(index<2?['--engine-strict']:[]),path.join(work,manifest.filename)],consumer);
  await fs.writeFile(path.join(output,`node${index}-install.log`),install.stdout+install.stderr);assert.equal(install.code,0,install.stderr);
  const pkg=path.join(consumer,'node_modules/qa-check-cli');assert.equal(await fs.realpath(pkg),pkg);
  const cli=path.join(pkg,'bin/qa-check.js');const external=path.join(consumer,'external cwd');await fs.mkdir(external);
  const guard=path.join(consumer,'guard.mjs');await fs.writeFile(guard,`export async function resolve(s,c,n){if(['lighthouse','playwright','chrome-launcher'].includes(s)||s.includes('/dist/index.js'))throw Error('Unsupported runtime reached scan initialization');return n(s,c)}`);
  const commands=[];
  for(const args of index<2?[['--version'],['--help']]:[['--version'],['--help'],['.']]){
   const result=run(node,[...(index===2?['--loader',pathToFileURL(guard).href]:[]),cli,...args],external);
   assert.equal(result.code,index<2?0:1,result.stdout+result.stderr);
   if(index===2){assert.match(result.stderr,/requires Node\.js >=22\.19; found v20/);assert.doesNotMatch(result.stderr,/Unsupported runtime reached scan initialization/);}
   if(index<2&&args[0]==='--version')assert.equal(result.stdout.trim(),JSON.parse(await fs.readFile(path.join(pkg,'package.json'),'utf8')).version);
   assert.deepEqual(await fs.readdir(external),[]);commands.push({args,...result});
  }
  if(index===2){
   const source=run(node,['--loader',pathToFileURL(guard).href,path.join(root,'bin/qa-check.js'),'--version'],external);
   assert.equal(source.code,1);assert.match(source.stderr,/requires Node\.js >=22\.19; found v20/);assert.doesNotMatch(source.stderr,/Unsupported runtime reached scan initialization/);
   const strict=run(node,[npm,'install','--engine-strict','--ignore-scripts','--no-audit','--no-fund',path.join(work,manifest.filename)],external);assert.notEqual(strict.code,0);assert.match(strict.stderr,/EBADENGINE/);await fs.writeFile(path.join(output,'node20-engine-strict.log'),strict.stdout+strict.stderr);
  }
  records.push({node:version,executable:node,installedExternalTarball:true,commands});
 }
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,records},null,2));console.log('Packed runtime compatibility PASS: Node 22.19+, 24 supported; Node 20 rejected before CLI initialization.');
}finally{
 assert.equal(path.dirname(work),parent);assert.ok(path.basename(work).startsWith('qa-lh13-runtime-'));
 await fs.rm(work,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 await fs.writeFile(path.join(output,'cleanup.json'),JSON.stringify({temporaryConsumerRemoved:true}));
}
