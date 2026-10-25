import fs from 'node:fs/promises';
import { verifyPackageVersion } from './package-version.mjs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SECURITY_POLICY, auditProduction } from './release-security.mjs';
import { resolveNpmCli } from './lab13-support.mjs';
import { configureConsumerBrowser } from './package-browser.mjs';
import { supportsNodeVersion } from '../../dist/core/nodeVersion.js';

const root = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const npm = await resolveNpmCli();
const outputRoot = path.join(root, 'test-reports/lab14-release');
const output = path.join(outputRoot, process.platform);
// Canonicalize /var -> /private/var on macOS before comparing installation paths.
const temporaryParent = await fs.realpath(os.tmpdir());
const work = await fs.realpath(await fs.mkdtemp(path.join(temporaryParent, 'qa lab14 ')));
const outside = path.relative(root, work);
assert.ok(outside === '..' || outside.startsWith('..' + path.sep) || path.isAbsolute(outside), 'Consumer must be outside source checkout');
const consumer = path.join(work, 'consumer project', 'nested installation');
const results = [];
const children = new Set();
let server;
let summary;
let failure;
const releaseChecks=[];
const security={policy:SECURITY_POLICY,source:{status:'NOT_RUN',passed:false},consumer:{status:'NOT_RUN',passed:false}};
let sourcePackage;
assert.equal(path.dirname(outputRoot), path.join(root, 'test-reports'));
assert.equal(path.dirname(output), outputRoot);
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.mkdir(consumer, { recursive: true });
await fs.writeFile(path.join(output, 'environment.json'), JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, separator: path.sep, npm, work, consumer }, null, 2));
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', PLAYWRIGHT_BROWSERS_PATH: path.join(work, 'browser binaries') };
// Avoid contradictory color settings generating PID-dependent tooling warnings.
delete env.FORCE_COLOR;
env.NO_COLOR = '1';
async function run(label, args, cwd = consumer, extraEnv = {}) {
  const log = await fs.open(path.join(output, label + '.log'), 'w');
  const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extraEnv }, detached: process.platform !== 'win32', stdio: ['ignore', log.fd, log.fd] });
  children.add(child);
  let timer;
  try {
    const completion = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(signal ? -1 : code));
      timer = setTimeout(() => { void stop(child).finally(() => reject(Error(`${label} exceeded 5-minute command budget; see invocation/log`))); }, 300000);
    });
    const [code] = await Promise.all([completion, fs.writeFile(path.join(output, label + '-invocation.json'), JSON.stringify({ executable: process.execPath, args, cwd, pid: child.pid, chromePath: env.CHROME_PATH ?? null, freeMemory: os.freemem(), loadAverage: os.loadavg() }, null, 2))]);
    return { code, text: await fs.readFile(path.join(output, label + '.log'), 'utf8') };
  } finally { clearTimeout(timer); await stop(child); children.delete(child); await log.close(); }
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!Number.isInteger(child.pid)) return;
  const closed = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    await new Promise(resolve => { const p = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); p.once('error', resolve); p.once('exit', resolve); });
  } else { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  let timer;
  await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await closed;
  }
}
let cleanupPromise;
async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    for (const child of children) await stop(child);
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    assert.equal(path.dirname(work), temporaryParent);
    assert.ok(path.basename(work).startsWith('qa lab14 '));
    await fs.rm(work, { recursive: true, force: true });
    await assert.rejects(fs.access(work));
  })();
  return cleanupPromise;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  try { await cleanup(); await fs.writeFile(path.join(output, 'interrupted.json'), JSON.stringify({ signal, tempRemoved: true })); }
  finally { process.exit(signal === 'SIGINT' ? 130 : 143); }
});
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
  sourcePackage=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  assert.equal(sourcePackage.name,lock.name);assert.equal(sourcePackage.version,lock.version);
  assert.equal(sourcePackage.version,lock.packages[''].version);
  assert.equal(sourcePackage.engines.node,'>=22.19');
  assert.ok(supportsNodeVersion(process.versions.node,sourcePackage.engines.node),'Node 22.19+ required');
  security.source=await auditProduction({run,npm,cwd:root,output,label:'audit-source'});
  assert.equal((await run('build', [npm, 'run', 'build'], root)).code, 0, 'Source build failed');
  const dry = await run('pack-dry-run', [npm, 'pack', '--dry-run', '--json', '--foreground-scripts=false'], root);
  assert.equal(dry.code, 0, 'npm pack dry run failed');
  const [dryPack] = JSON.parse(dry.text);
  const paths = dryPack.files.map(file => file.path);
  for (const required of ['package.json', 'bin/qa-check.js', 'dist/index.js', 'dist/core/doctor.js', 'dist/reporters/html.js', 'dist/reporters/pdf.js']) assert.ok(paths.includes(required), `Missing runtime file ${required}`);
  for (const file of paths) assert.ok(/^(README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?|package\.json|bin\/[^/]+\.js|dist\/(?!tests\/).+\.js)$/i.test(file), `Unexpected packaged artifact ${file}`);
  for (const file of paths) assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bnpm_[A-Za-z0-9]{36}\b/.test(await fs.readFile(path.join(root, file), 'utf8')), `Potential secret in ${file}`);
  const packed = await run('pack', [npm, 'pack', '--json', '--foreground-scripts=false', '--pack-destination', work], root);
  assert.equal(packed.code, 0);
  const [manifest] = JSON.parse(packed.text);
  assert.deepEqual(manifest.files, dryPack.files);
  await fs.writeFile(path.join(output, 'package-manifest.json'), JSON.stringify(manifest, null, 2));
  const tarball = path.join(work, manifest.filename);
  assert.equal((await fs.stat(tarball)).size, manifest.size);
  const digest = createHash('sha512').update(await fs.readFile(tarball)).digest('base64');
  assert.equal(manifest.integrity, `sha512-${digest}`);
  await fs.writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'lab14-external-consumer', private: true, version: '1.0.0' }));
  const install = await run('install', [npm, 'install', '--omit=dev', '--no-audit', '--no-fund', '--prefer-offline', tarball]);
  assert.equal(install.code, 0, 'External tarball installation failed');
  await fs.access(path.join(consumer,'package-lock.json'));
  const consumerLock=JSON.parse(await fs.readFile(path.join(consumer,'package-lock.json'),'utf8'));
  assert.equal(consumerLock.packages['node_modules/qa-check-cli']?.version,sourcePackage.version,'Consumer audit lock must include the packed CLI');
  await fs.copyFile(path.join(consumer,'package-lock.json'),path.join(output,'consumer-package-lock.json'));
  security.consumer=await auditProduction({run,npm,cwd:consumer,output,label:'audit-consumer'});
  const pkg = path.join(consumer, 'node_modules/qa-check-cli');
  assert.equal(await fs.realpath(pkg), pkg, 'Installed package must not be a source symlink');
  const packageJson = JSON.parse(await fs.readFile(path.join(pkg, 'package.json'), 'utf8'));
  assert.equal(packageJson.name,sourcePackage.name);assert.equal(packageJson.version,sourcePackage.version);
  for(const key of ['main','bin','exports','engines','dependencies','license','type'])assert.deepEqual(packageJson[key],sourcePackage[key], 'Packed metadata mismatch: '+key);
  assert.notEqual(packageJson.private,true,'Release candidate is marked private');
  assert.match(packageJson.version,/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  await fs.access(path.join(pkg,packageJson.main));await fs.access(path.join(pkg,'README.md'));
  assert.equal(manifest.name,packageJson.name);assert.equal(manifest.version,packageJson.version);
  const bin = path.resolve(pkg, packageJson.bin['qa-check']);
  assert.ok(bin.startsWith(pkg + path.sep));
  assert.match(await fs.readFile(bin, 'utf8'), /^#!\/usr\/bin\/env node/);
  await fs.access(path.join(consumer, 'node_modules/.bin/qa-check' + (process.platform === 'win32' ? '.cmd' : '')));
  for (const file of ['src', 'dist/tests', 'test-reports']) await assert.rejects(fs.access(path.join(pkg, file)));
  // The loader blocks every module outside the external consumer (Node builtins remain allowed).
  const guard = path.join(consumer, 'isolation-loader.mjs');
  await fs.writeFile(guard, `import {fileURLToPath} from 'node:url';import path from 'node:path';const root=${JSON.stringify(consumer)};export async function resolve(s,c,next){const r=await next(s,c);if(r.url.startsWith('file:')){const rel=path.relative(root,fileURLToPath(r.url));if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('External module forbidden: '+r.url);}return r;}`);
  const cli = ['--experimental-loader', pathToFileURL(guard).href, bin];
  await verifyPackageVersion({ consumer, pkg, cli, run });
  const shimProbe=path.join(consumer,'shim-probe.mjs');
  await fs.writeFile(shimProbe, `import {spawn} from 'node:child_process';
const shim=${JSON.stringify(path.join(consumer,'node_modules/.bin/qa-check'+(process.platform==='win32'?'.cmd':'')))};
const args=process.platform==='win32'?['/d','/s','/c','""'+shim+'" --help"']:['--help'];
const child=spawn(process.platform==='win32'?'cmd.exe':shim,args,{stdio:'inherit',windowsVerbatimArguments:process.platform==='win32',env:{...process.env,NODE_OPTIONS:'--experimental-loader='+${JSON.stringify(pathToFileURL(guard).href)}}});
child.once('error',error=>{console.error(error);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});`);
  const shim=await run('installed-shim-help',[shimProbe]);assert.equal(shim.code,0,shim.text);assert.match(shim.text,/Usage/);
  for (const args of [['--help'], ['help'], ['-h']]) { const r = await run('help-' + results.length, [...cli, ...args]); assert.equal(r.code, 0); assert.match(r.text, /Usage/); results.push({ command: args.join(' '), exitCode: r.code }); }
  // README documents --version: test its promised output instead of assuming support.
  const version=await run('documented-version',[...cli,'--version']);
  releaseChecks.push({command:'--version',expectedExit:0,actualExit:version.code,expectedVersion:packageJson.version,
    passed:version.code===0 && version.text.split(/\s+/).includes(packageJson.version)});
  // Browser installation is explicit, using the consumer dependency, never a global CLI.
  const playwrightCli = path.join(consumer, 'node_modules/playwright/cli.js');
  assert.equal((await run('browser-install', [playwrightCli, 'install', 'chromium'])).code, 0);
  await configureConsumerBrowser({ consumer, output, env, run, loaderArgs: cli.slice(0, 2) });
  const init = path.join(consumer, 'init target with spaces'); await fs.mkdir(init);
  assert.equal((await run('init', [...cli, 'init', init])).code, 0);
  for (const file of ['qa-check.config.json', '.github/workflows/qa-check.yml']) assert.ok((await fs.stat(path.join(init, file))).size > 0);
  const html = path.join(consumer, 'fixtures with spaces', 'nested site'); await fs.mkdir(html, { recursive: true });
  const otherCwd = path.join(consumer, 'working directories', 'different cwd'); await fs.mkdir(otherCwd, { recursive: true });
  let clean = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="A clean external package smoke test page."><link rel="canonical" href="__LAB12_ORIGIN__/"><meta property="og:title" content="Package validation"><meta property="og:type" content="website"><meta property="og:url" content="__LAB12_ORIGIN__/"><meta name="twitter:card" content="summary"><title>Lab 12 package validation</title></head><body><main><h1>Package validation</h1><p>Ready to test.</p></main></body></html>';
  await fs.writeFile(path.join(html, 'index.html'), clean);
  const doctor = await run('doctor', [...cli, 'doctor', html]); assert.equal(doctor.code, 0); assert.match(doctor.text, /Doctor Diagnostics/);
  results.push({ command: 'doctor <html-project>', exitCode: doctor.code });
  const forwardDoctor = await run('doctor-forward-slashes', [...cli, 'doctor', html.split(path.sep).join('/')], otherCwd);
  assert.equal(forwardDoctor.code, 0);
  results.push({ command: 'doctor with forward-slash absolute path from other cwd', exitCode: forwardDoctor.code });
  if (process.platform !== 'win32') {
    const invalid = await run('doctor-windows-separators', [...cli, 'doctor', html.replaceAll('/', '\\')], otherCwd);
    assert.equal(invalid.code, 1, 'POSIX must reject a nonexistent Windows-style path');
    assert.match(invalid.text, /ENOENT|no such file/i);
    results.push({ command: 'Windows-style nonexistent path on POSIX', expected: 'backslash is not a POSIX separator', exitCode: invalid.code });
  }
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
  for (const scenario of ['clean', 'defect', 'recovery']) {
    if (scenario === 'defect') await fs.writeFile(path.join(html, 'index.html'), clean.replace('</main>', '<a href="/ghost">Missing page</a><img src="/missing.png" alt="Missing illustration"></main>'));
    if (scenario === 'recovery') await fs.writeFile(path.join(html, 'index.html'), clean);
    const dir = path.join(output, scenario + ' reports');
    const cwd = scenario === 'recovery' ? html : otherCwd;
    const target = scenario === 'clean' ? path.relative(cwd, html) : scenario === 'defect' ? html : '.';
    const r = await run(scenario, [...cli, target, '--ci', '--profile', 'ci', '--fail-on', 'error', '--url', url, '--output', path.relative(cwd, dir), '--pdf', '--markdown', '--no-history', ...(baseline ? ['--baseline', path.relative(cwd, baseline)] : ['--no-baseline'])], cwd);
    assert.equal(r.code, scenario === 'defect' ? 2 : 0, r.text.slice(-3000));
    for (const file of ['index.html', 'report.json', 'report.md', 'report.pdf']) assert.ok((await fs.stat(path.join(dir, file))).size > 0, `Missing report ${file}`);
    const report = JSON.parse(await fs.readFile(path.join(dir, 'report.json'), 'utf8'));
    const scoreEvidence = { scenario, expectedScore: scenario === 'defect' ? 96 : 100, actualScore: report.overallScore,
      scanners: report.results.map(({ name, status, score, message, data, metadata }) => ({ name, status, score, message, data, metadata })),
      resources: { freeMemory: os.freemem(), loadAverage: os.loadavg() }, chromePath: env.CHROME_PATH };
    await fs.writeFile(path.join(dir, 'score-diagnostics.json'), JSON.stringify(scoreEvidence, null, 2));
    assert.equal(report.framework, 'HTML'); assert.equal(report.currentQualityGate.confidence, 'FULL'); assert.equal(report.coverage.coveragePercent, 100);
    assert.equal(report.currentQualityGate.passed, scenario !== 'defect');
    assert.equal(report.overallScore, scenario === 'defect' ? 96 : 100, `Platform score differs from fixture contract; inspect score-diagnostics.json. Scored checks: ${JSON.stringify(report.results.filter(r => typeof r.score === 'number').map(({ name, status, score }) => ({ name, status, score })))}`);
    assert.equal(await fs.realpath(report.projectPath), html);
    assert.deepEqual(report.routes, ['/']);
    assert.equal((await fs.readFile(path.join(dir, 'report.pdf'))).subarray(0, 5).toString(), '%PDF-');
    if (scenario === 'recovery') { assert.equal(report.baseline.qualityGate.passed, true); assert.equal(report.baseline.categorizedIssues.newIssues.length, 0); assert.ok(report.baseline.categorizedIssues.fixedIssues.length > 0); }
    for (const check of report.results) assert.ok(!['ERROR', 'PARTIAL', 'TIMEOUT', 'BLOCKED', 'SKIPPED'].includes(check.status), `${check.name}: ${check.status}`);
    if (scenario === 'defect') {
      for (const [name, marker] of [['Broken Links', '/ghost'], ['Broken Images', '/missing.png']]) { const check = report.results.find(r => r.name === name); assert.equal(check?.status, 'FAIL'); assert.ok(JSON.stringify(check.data).includes(marker)); }
      assert.equal(report.baseline.qualityGate.passed, false);
      assert.ok(report.baseline.categorizedIssues.newIssues.length > 0);
    }
    results.push({ scenario, exitCode: r.code, score: report.overallScore, coverage: report.coverage.coveragePercent });
    baseline = path.join(dir, 'report.json');
  }
  assert.equal((await run('compare-regression', [...cli, 'compare', path.join(output, 'clean reports/report.json'), path.join(output, 'defect reports/report.json')], otherCwd)).code, 1);
  assert.equal((await run('compare-unchanged', [...cli, 'compare', baseline, baseline])).code, 0);
  summary = { platform: process.platform, node: process.version, passed: true, package: { name: manifest.name, version: manifest.version, size: manifest.size, unpackedSize: manifest.unpackedSize, files: manifest.files.length, integrity: manifest.integrity }, results };
} catch (error) {
  failure = error;
  summary = { platform: process.platform, passed: false, error: error.stack, results };
} finally {
  try { await cleanup(); assert.equal(await snapshot(), before, 'Source repository changed during package validation'); await fs.writeFile(path.join(output, 'cleanup.json'), JSON.stringify({ tempRemoved: true, sourceUnchanged: true, consumerOutsideRepository: true, ownedChildrenStopped: true })); }
  catch (error) { failure ||= error; summary = { ...summary, passed: false, cleanupError: error.stack }; }
  const functionalPassed=!failure && releaseChecks.every(item=>item.passed);
  const securityPassed=security.source.passed && security.consumer.passed;
  summary={...summary,passed:functionalPassed && securityPassed,recommendation:functionalPassed && securityPassed?'READY':'BLOCKED',
    functional:{passed:functionalPassed,harnessCompleted:!failure,checks:releaseChecks},security,
    compatibility:{platform:process.platform,arch:process.arch,node:process.version,declaredEngines:sourcePackage?.engines?.node,
      limitation:'This result covers this runtime only; review every hosted matrix leg before release'},
    exitCode:!functionalPassed?1:!securityPassed?3:0};
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.exitCode;
