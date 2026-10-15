import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { waitForVite } from './vite-readiness.mjs';
import { finished } from 'node:stream/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'tests/fixtures/lab11-cicd');
const output = path.join(root, 'test-reports/lab11-cicd');
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-lab11-ci-'));
const app = path.join(work, 'app');
const children = new Set();
const failureServer = http.createServer((request) => request.socket.destroy());
const outcomes = [];
assert.equal(path.dirname(output), path.join(root, 'test-reports'));
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
// Invoking the JS entrypoint avoids platform-specific npm.cmd shell quoting.
async function run(args, cwd, log) {
  const handle = await fs.open(log, 'w');
  const child = spawn(process.execPath, args, { cwd, env: process.env, detached: process.platform !== 'win32', stdio: ['ignore', handle.fd, handle.fd] });
  children.add(child);
  try { return await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve(signal ? -1 : code)); }); }
  finally { children.delete(child); await handle.close(); }
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    await new Promise(resolve => { const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); killer.once('error', resolve); killer.once('exit', resolve); });
  } else { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  let timer;
  await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await closed;
  }
  children.delete(child);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  for (const child of children) await stop(child);
  failureServer.closeAllConnections();
  failureServer.close();
  await fs.rm(work, { recursive: true, force: true });
  process.exit(signal === 'SIGINT' ? 130 : 143);
});
function checkReport(report, scenario) {
  assert.equal(report.framework, 'React');
  assert.deepEqual([...report.routes].sort(), ['/', '/contact', '/products']);
  assert.equal(report.coverage.coveragePercent, 100, 'Incomplete scanner coverage');
  assert.equal(report.currentQualityGate.confidence, 'FULL');
  for (const result of report.results) {
    assert.ok(!['ERROR', 'PARTIAL', 'TIMEOUT', 'BLOCKED', 'SKIPPED'].includes(result.status), `${result.name}: ${result.status}`);
  }
  const required = ['Build', 'ESLint', 'TypeScript', 'Responsive', 'Accessibility', 'Lighthouse Performance', 'Performance', 'Broken Links', 'Broken Images', 'Console Errors', 'Network Errors'];
  for (const name of required) {
    const result = report.results.find(result => result.name === name);
    assert.ok(result, `Missing scanner ${name}`);
    assert.ok(['PASS', 'WARNING', 'FAIL'].includes(result.status), `Missing execution evidence: ${name}`);
    if (['Responsive', 'Accessibility', 'Lighthouse Performance', 'Performance', 'Broken Links', 'Broken Images', 'Console Errors', 'Network Errors'].includes(name)) assert.equal(result.pagesCompleted, 3, `Incomplete ${name} routes`);
  }
  assert.equal(report.currentQualityGate.passed, scenario !== 'regression');
  if (scenario !== 'clean') {
    assert.ok(report.baseline, 'Missing baseline comparison');
    assert.equal(report.baseline.qualityGate.passed, scenario === 'recovery');
    if (scenario === 'recovery') {
      assert.equal(report.baseline.categorizedIssues.newIssues.length, 0);
      assert.ok(report.baseline.categorizedIssues.fixedIssues.length > 0, 'No recovered defects');
    } else assert.ok(report.baseline.categorizedIssues.newIssues.length > 0, 'False regression result');
  }
  if (scenario === 'regression') {
    for (const [name, key, marker] of [['Broken Images', 'issues', 'missing-banner.png'], ['Console Errors', 'errors', 'LAB11 intentional runtime console error'], ['Network Errors', 'issues', '/intentional-failure']]) {
      const result = report.results.find(result => result.name === name);
      assert.equal(result.status, 'FAIL', `Undetected ${name}`);
      assert.ok(result.data[key].length > 0);
      assert.ok(JSON.stringify(result.data[key]).includes(marker), `Missing seeded evidence in ${name}`);
    }
  }
}
try {
  await fs.cp(fixture, app, { recursive: true, filter: source => !['node_modules', 'dist', 'reports'].includes(path.basename(source)) && !source.endsWith('.tsbuildinfo') });
  await new Promise(resolve => failureServer.listen(0, '127.0.0.1', resolve));
  const failureUrl = `http://127.0.0.1:${failureServer.address().port}/intentional-failure`;
  const main = path.join(app, 'src/main.tsx');
  await fs.writeFile(main, (await fs.readFile(main, 'utf8')).replace('/__lab11/intentional-failure.json', failureUrl));
  assert.equal(await run([npmCli, 'ci'], app, path.join(output, 'install.log')), 0, 'Fixture npm ci failed');
  let baseline;
  for (const scenario of ['clean', 'regression', 'recovery']) {
    const dir = path.join(output, scenario);
    await fs.mkdir(dir, { recursive: true });
    // Only the disposable app is changed; recovery restores the original source.
    const clean = await fs.readFile(path.join(fixture, 'src/scenario.ts'), 'utf8');
    await fs.writeFile(path.join(app, 'src/scenario.ts'), scenario === 'regression' ? clean.replace(/"(brokenImage|consoleError|networkError)": false/g, '"$1": true') : clean);
    let server;
    let log;
    let readiness;
    let logWrites = Promise.resolve();
    try {
      assert.equal(await run([npmCli, 'run', 'build'], app, path.join(dir, 'build.log')), 0, 'Fixture build failed');
      log = await fs.open(path.join(dir, 'server.log'), 'w');
      server = spawn(process.execPath, [path.join(app, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '0', '--strictPort'], { cwd: app, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', log.fd] });
      children.add(server);
      server.on('error', () => {});
      server.stdout.on('data', data => { logWrites = logWrites.then(() => log.write(data)); });
      readiness = { pid: server.pid, command: server.spawnargs, host: '127.0.0.1', requestedPort: 0 };
      const url = await waitForVite(server);
      readiness.url = url;
      readiness.port = Number(new URL(url).port);
      readiness.ready = true;
      const args = [path.join(root, 'bin/qa-check.js'), app, '--ci', '--profile', 'ci', '--fail-on', 'error', '--url', url, '--output', dir, '--pdf', '--markdown', '--no-history', '--lighthouse-budget-ms', '180000'];
      args.push(...(baseline ? ['--baseline', baseline] : ['--no-baseline']));
      const exitCode = await run(args, root, path.join(dir, 'qa.log'));
      assert.equal(exitCode, scenario === 'regression' ? 2 : 0, `Unexpected ${scenario} exit code`);
      for (const file of ['index.html', 'report.json', 'report.md', 'report.pdf']) assert.ok((await fs.stat(path.join(dir, file))).size > 0, `Missing ${scenario}/${file}`);
      const report = JSON.parse(await fs.readFile(path.join(dir, 'report.json'), 'utf8'));
      checkReport(report, scenario);
      outcomes.push({ scenario, passed: true, exitCode, score: report.overallScore });
      // Recovery compares against regression so fixed issues must be demonstrated.
      baseline = path.join(dir, 'report.json');
    } catch (error) {
      if (readiness) readiness.error = error.stack;
      outcomes.push({ scenario, passed: false, error: error.stack });
      // Keep validating the remaining scenarios; compare only real available reports.
      try { await fs.access(path.join(dir, 'report.json')); baseline = path.join(dir, 'report.json'); } catch { baseline = undefined; }
    } finally {
      if (server) await stop(server);
      if (server?.stdout) await finished(server.stdout).catch(error => { if (readiness) readiness.stdoutError = error.message; });
      await logWrites;
      if (log) await log.close();
      if (readiness) await fs.writeFile(path.join(dir, 'readiness.json'), JSON.stringify({ ...readiness, exitCode: server.exitCode, signal: server.signalCode }, null, 2));
    }
  }
} catch (error) { outcomes.push({ scenario: 'setup', passed: false, error: error.stack }); }
finally {
  for (const child of children) await stop(child);
  failureServer.closeAllConnections();
  await new Promise(resolve => failureServer.close(resolve));
  assert.equal(path.dirname(work), os.tmpdir(), 'Unsafe temporary cleanup target');
  await fs.rm(work, { recursive: true, force: true });
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(outcomes, null, 2));
}
console.log(JSON.stringify(outcomes, null, 2));
process.exitCode = outcomes.length !== 3 || outcomes.some(result => !result.passed) ? 1 : 0;
