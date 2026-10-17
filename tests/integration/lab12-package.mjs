import fs from 'node:fs/promises';
import { configureConsumerBrowser } from './package-browser.mjs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'test-reports/lab12-package');
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-lab12-'));
assert.ok(path.relative(root, work).startsWith('..'), 'Consumer must be outside source checkout');
const consumer = path.join(work, 'consumer');
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const results = [];
let server;
assert.equal(path.dirname(output), path.join(root, 'test-reports'));
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.mkdir(consumer);
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' };
// Avoid contradictory color settings generating PID-dependent tooling warnings.
delete env.FORCE_COLOR;
env.NO_COLOR = '1';
async function run(label, args, cwd = consumer, extraEnv = {}) {
  const log = await fs.open(path.join(output, label + '.log'), 'w');
  const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extraEnv }, stdio: ['ignore', log.fd, log.fd] });
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve(signal ? -1 : code)); });
    await fs.writeFile(path.join(output, label + '-invocation.json'), JSON.stringify({ executable: process.execPath, args, cwd, pid: child.pid, code, chromePath: env.CHROME_PATH ?? null, freeMemory: os.freemem(), loadAverage: os.loadavg() }, null, 2));
    return { code, text: await fs.readFile(path.join(output, label + '.log'), 'utf8') };
  } finally { await log.close(); }
}
async function snapshot() {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist', 'test-reports', 'reports', '.next'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push([path.relative(root, file), createHash('sha256').update(await fs.readFile(file)).digest('hex')]);
    }
  }
  await walk(root);
  return JSON.stringify(files.sort((a, b) => a[0].localeCompare(b[0])));
}
const before = await snapshot();
try {
  assert.equal((await run('build', [npm, 'run', 'build'], root)).code, 0, 'Source build failed');
  const dry = await run('pack-dry-run', [npm, 'pack', '--dry-run', '--json'], root);
  assert.equal(dry.code, 0, 'npm pack dry run failed');
  const [dryPack] = JSON.parse(dry.text);
  const paths = dryPack.files.map(file => file.path);
  for (const required of ['package.json', 'bin/qa-check.js', 'dist/index.js', 'dist/core/doctor.js', 'dist/reporters/html.js', 'dist/reporters/pdf.js']) assert.ok(paths.includes(required), `Missing runtime file ${required}`);
  for (const file of paths) assert.ok(/^(README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?|package\.json|bin\/[^/]+\.js|dist\/(?!tests\/).+\.js)$/i.test(file), `Unexpected packaged artifact ${file}`);
  for (const file of paths) assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bnpm_[A-Za-z0-9]{36}\b/.test(await fs.readFile(path.join(root, file), 'utf8')), `Potential secret in ${file}`);
  const packed = await run('pack', [npm, 'pack', '--json', '--pack-destination', work], root);
  assert.equal(packed.code, 0);
  const [manifest] = JSON.parse(packed.text);
  assert.deepEqual(manifest.files, dryPack.files);
  await fs.writeFile(path.join(output, 'package-manifest.json'), JSON.stringify(manifest, null, 2));
  const tarball = path.join(work, manifest.filename);
  assert.equal((await fs.stat(tarball)).size, manifest.size);
  const digest = createHash('sha512').update(await fs.readFile(tarball)).digest('base64');
  assert.equal(manifest.integrity, `sha512-${digest}`);
  await fs.writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'lab12-external-consumer', private: true, version: '1.0.0' }));
  const install = await run('install', [npm, 'install', '--omit=dev', '--no-audit', '--no-fund', '--no-save', '--prefer-offline', tarball]);
  assert.equal(install.code, 0, 'External tarball installation failed');
  const pkg = path.join(consumer, 'node_modules/qa-check-cli');
  assert.equal(await fs.realpath(pkg), pkg, 'Installed package must not be a source symlink');
  const packageJson = JSON.parse(await fs.readFile(path.join(pkg, 'package.json'), 'utf8'));
  const bin = path.resolve(pkg, packageJson.bin['qa-check']);
  assert.ok(bin.startsWith(pkg + path.sep));
  assert.match(await fs.readFile(bin, 'utf8'), /^#!\/usr\/bin\/env node/);
  await fs.access(path.join(consumer, 'node_modules/.bin/qa-check' + (process.platform === 'win32' ? '.cmd' : '')));
  for (const file of ['src', 'dist/tests', 'test-reports']) await assert.rejects(fs.access(path.join(pkg, file)));
  // The loader blocks every module outside the external consumer (Node builtins remain allowed).
  const guard = path.join(consumer, 'isolation-loader.mjs');
  await fs.writeFile(guard, `import {fileURLToPath} from 'node:url';import path from 'node:path';const root=${JSON.stringify(consumer)};export async function resolve(s,c,next){const r=await next(s,c);if(r.url.startsWith('file:')){const rel=path.relative(root,fileURLToPath(r.url));if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('External module forbidden: '+r.url);}return r;}`);
  const cli = ['--experimental-loader', pathToFileURL(guard).href, bin];
  for (const args of [['--help'], ['help'], ['-h']]) { const r = await run('help-' + results.length, [...cli, ...args]); assert.equal(r.code, 0); assert.match(r.text, /Usage/); results.push({ command: args.join(' '), exitCode: r.code }); }
  // Browser installation is explicit, using the consumer dependency, never a global CLI.
  const playwrightCli = path.join(consumer, 'node_modules/playwright/cli.js');
  assert.equal((await run('browser-install', [playwrightCli, 'install', 'chromium'])).code, 0);
  await configureConsumerBrowser({ consumer, output, env, run, loaderArgs: cli.slice(0, 2) });
  const init = path.join(consumer, 'init-target'); await fs.mkdir(init);
  assert.equal((await run('init', [...cli, 'init', init])).code, 0);
  for (const file of ['qa-check.config.json', '.github/workflows/qa-check.yml']) assert.ok((await fs.stat(path.join(init, file))).size > 0);
  const html = path.join(consumer, 'site'); await fs.mkdir(html);
  let clean = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="A clean external package smoke test page."><link rel="canonical" href="__LAB12_ORIGIN__/"><meta property="og:title" content="Package validation"><meta property="og:type" content="website"><meta property="og:url" content="__LAB12_ORIGIN__/"><meta name="twitter:card" content="summary"><title>Lab 12 package validation</title></head><body><main><h1>Package validation</h1><p>Ready to test.</p></main></body></html>';
  await fs.writeFile(path.join(html, 'index.html'), clean);
  const doctor = await run('doctor', [...cli, 'doctor', html]); assert.equal(doctor.code, 0); assert.match(doctor.text, /Doctor Diagnostics/);
  results.push({ command: 'doctor <html-project>', exitCode: doctor.code });
  for (const command of ['api', 'test', 'e2e']) { const r = await run(command + '-empty', [...cli, command, html]); assert.equal(r.code, 0); assert.match(r.text, /No .*configured/); }
  assert.equal((await run('flow-empty', [...cli, 'flow', html])).code, 0);
  assert.equal((await run('fix-dry-run', [...cli, 'fix', html, '--dry-run'])).code, 0);
  server = http.createServer(async (req, res) => { if (req.url === '/' || req.url === '/index.html') { res.setHeader('Content-Type', 'text/html'); res.end(await fs.readFile(path.join(html, 'index.html'))); } else if (req.url === '/robots.txt' || req.url === '/sitemap.xml') { res.setHeader('Content-Type', req.url.endsWith('.xml') ? 'application/xml' : 'text/plain'); res.end(await fs.readFile(path.join(html, req.url.slice(1)))); } else { res.statusCode = 404; res.end('Not found'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  clean = clean.replaceAll('__LAB12_ORIGIN__', url);
  await fs.writeFile(path.join(html, 'index.html'), clean);
  await fs.writeFile(path.join(html, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${url}/sitemap.xml\n`);
  await fs.writeFile(path.join(html, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}/</loc></url></urlset>`);
  let baseline;
  for (const scenario of ['clean', 'defect']) {
    if (scenario === 'defect') await fs.writeFile(path.join(html, 'index.html'), clean.replace('</main>', '<a href="/ghost">Missing page</a><img src="/missing.png" alt="Missing illustration"></main>'));
    const dir = path.join(output, scenario);
    const r = await run(scenario, [...cli, html, '--ci', '--profile', 'ci', '--fail-on', 'error', '--url', url, '--output', dir, '--pdf', '--markdown', '--no-history', ...(baseline ? ['--baseline', baseline] : ['--no-baseline'])]);
    assert.equal(r.code, scenario === 'clean' ? 0 : 2, r.text.slice(-3000));
    for (const file of ['index.html', 'report.json', 'report.md', 'report.pdf']) assert.ok((await fs.stat(path.join(dir, file))).size > 0, `Missing report ${file}`);
    const report = JSON.parse(await fs.readFile(path.join(dir, 'report.json'), 'utf8'));
    assert.equal(report.framework, 'HTML'); assert.equal(report.currentQualityGate.confidence, 'FULL'); assert.equal(report.coverage.coveragePercent, 100);
    assert.equal(report.currentQualityGate.passed, scenario === 'clean');
    assert.equal(report.overallScore, scenario === 'clean' ? 100 : 96);
    assert.equal((await fs.readFile(path.join(dir, 'report.pdf'))).subarray(0, 5).toString(), '%PDF-');
    for (const check of report.results) assert.ok(!['ERROR', 'PARTIAL', 'TIMEOUT', 'BLOCKED', 'SKIPPED'].includes(check.status), `${check.name}: ${check.status}`);
    if (scenario === 'defect') {
      for (const [name, marker] of [['Broken Links', '/ghost'], ['Broken Images', '/missing.png']]) { const check = report.results.find(r => r.name === name); assert.equal(check?.status, 'FAIL'); assert.ok(JSON.stringify(check.data).includes(marker)); }
      assert.equal(report.baseline.qualityGate.passed, false);
      assert.ok(report.baseline.categorizedIssues.newIssues.length > 0);
    }
    results.push({ scenario, exitCode: r.code, score: report.overallScore, coverage: report.coverage.coveragePercent });
    baseline = path.join(dir, 'report.json');
  }
  assert.equal((await run('compare-regression', [...cli, 'compare', path.join(output, 'clean/report.json'), baseline])).code, 1);
  assert.equal((await run('compare-unchanged', [...cli, 'compare', baseline, baseline])).code, 0);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, package: { name: manifest.name, version: manifest.version, size: manifest.size, unpackedSize: manifest.unpackedSize, files: manifest.files.length, integrity: manifest.integrity }, results }, null, 2));
  console.log(JSON.stringify({ passed: true, size: manifest.size, files: manifest.files.length, results }, null, 2));
} catch (error) {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: false, error: error.stack, results }, null, 2));
  throw error;
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.equal(path.dirname(work), os.tmpdir());
  await fs.rm(work, { recursive: true, force: true });
  await assert.rejects(fs.access(work));
  assert.equal(await snapshot(), before, 'Source repository changed during package validation');
  await fs.writeFile(path.join(output, 'cleanup.json'), JSON.stringify({ tempRemoved: true, sourceUnchanged: true, consumerOutsideRepository: true }));
}
