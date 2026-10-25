import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));

for (const entry of ['bin/qa-check.js', 'dist/index.js']) test(`--version from external cwd: repository ${entry}`, async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-version-'));
  try {
    const cwd = path.join(work, 'external project'); await fs.mkdir(cwd);
    const files = { 'package.json': '{"version":"99.99.99"}', 'qa-check.config.json': '{invalid config' };
    for (const [name, contents] of Object.entries(files)) await fs.writeFile(path.join(cwd, name), contents);
    const guard = path.join(work, 'guard.mjs');
    await fs.writeFile(guard, `export async function resolve(s,c,next){if(['playwright','lighthouse','chrome-launcher'].some(n=>s===n||s.startsWith(n+'/')))throw Error('Browser import forbidden');const r=await next(s,c);if(r.url.includes('/core/engine.')||r.url.includes('/pipeline/runtime.'))throw Error('Scan initialization forbidden');return r;}`);
    const args = ['--loader', pathToFileURL(guard).href, path.join(root, entry), '--version'];
    const result = await exec(process.execPath, args, { cwd, timeout: 30_000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', CHROME_PATH: path.join(work, 'browser-must-not-launch') } });
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    assert.equal(result.stdout.trim(), metadata.version);
    assert.doesNotMatch(result.stderr, /Browser import forbidden|Scan initialization forbidden/);
    assert.deepEqual((await fs.readdir(cwd)).sort(), Object.keys(files).sort());
    for (const [name, contents] of Object.entries(files)) assert.equal(await fs.readFile(path.join(cwd, name), 'utf8'), contents);
  } finally { await fs.rm(work, { recursive: true, force: true }); }
});
