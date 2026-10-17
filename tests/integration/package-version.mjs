import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export async function verifyPackageVersion({consumer, pkg, cli, run}) {
  const cwd=path.join(consumer,'version external cwd'); await fs.mkdir(cwd);
  const files={'package.json':'{"version":"99.99.99"}','qa-check.config.json':'{invalid config'};
  for(const [name,contents] of Object.entries(files))await fs.writeFile(path.join(cwd,name),contents);
  const guard=path.join(consumer,'version-guard.mjs');
  await fs.writeFile(guard,`export async function resolve(s,c,next){if(['playwright','lighthouse','chrome-launcher'].some(n=>s===n||s.startsWith(n+'/')))throw Error('Browser import forbidden');const r=await next(s,c);if(r.url.includes('/core/engine.')||r.url.includes('/pipeline/runtime.'))throw Error('Scan initialization forbidden');return r;}`);
  const metadataPath=path.join(pkg,'package.json'); const original=await fs.readFile(metadataPath,'utf8');
  const metadata=JSON.parse(original);
  try {
    for(const [label,expected] of [['installed',metadata.version],['dynamic','0.0.0-lab-version-test']]) {
      if(label==='dynamic')await fs.writeFile(metadataPath,JSON.stringify({...metadata,version:expected}));
      const result=await run('version-'+label,[...cli.slice(0,2),'--experimental-loader',pathToFileURL(guard).href,cli.at(-1),'--version'],cwd,{NODE_NO_WARNINGS:'1'});
      assert.equal(result.code,0,result.text);assert.equal(result.text.trim(),expected,'Version must come only from installed package metadata');
      assert.deepEqual((await fs.readdir(cwd)).sort(),Object.keys(files).sort());
      for(const [name,contents] of Object.entries(files))assert.equal(await fs.readFile(path.join(cwd,name),'utf8'),contents);
    }
  } finally {await fs.writeFile(metadataPath,original);}
  assert.equal(await fs.readFile(metadataPath,'utf8'),original);
}
