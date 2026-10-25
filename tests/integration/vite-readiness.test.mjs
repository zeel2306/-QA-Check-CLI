import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { waitForVite } from './vite-readiness.mjs';

function child() { return Object.assign(new EventEmitter(), { stdout: new PassThrough(), pid: 123, exitCode: null, signalCode: null }); }
test('colored Vite output with a decorated port is probed at the actual URL', async () => {
  const server = child(); let called;
  const ready = waitForVite(server, { probe: async url => { called = url; return new Response('ready'); } });
  server.stdout.write('\x1b[36mhttp://127.0.0.1:\x1b[');
  server.stdout.write('1m59569\x1b[22m/\x1b[39m\n');
  assert.equal(await ready, 'http://127.0.0.1:59569');
  assert.equal(called, 'http://127.0.0.1:59569');
});
test('readiness retries non-200 responses instead of trusting the URL alone', async () => {
  const server = child(); let probes = 0;
  const ready = waitForVite(server, { probe: async () => new Response('', { status: ++probes === 1 ? 503 : 200 }) });
  server.stdout.write('http://127.0.0.1:3111/');
  assert.equal(await ready, 'http://127.0.0.1:3111'); assert.equal(probes, 2);
});
test('a port split between stdout chunks is not mistaken for a shorter port', async () => {
  const server = child(); let called;
  const ready = waitForVite(server, { probe: async url => { called = url; return new Response('ready'); } });
  server.stdout.write('http://127.0.0.1:59');
  assert.equal(called, undefined);
  server.stdout.write('569/');
  assert.equal(await ready, 'http://127.0.0.1:59569');
});
test('child exit fails immediately while an HTTP probe is pending', async () => {
  const server = child(); const ready = waitForVite(server, { probe: () => new Promise(() => {}) });
  server.stdout.write('http://127.0.0.1:3111/'); server.exitCode = 1; server.emit('exit', 1, null);
  await assert.rejects(ready, /Vite exited before readiness.*code=1/);
  assert.equal(server.listenerCount('exit'), 0);
});
test('spawn errors are preserved', async () => {
  const server = child(); const ready = waitForVite(server);
  server.emit('error', Error('ENOENT'));
  await assert.rejects(ready, /Vite launch failed: ENOENT/);
});
test('timeout retains process and output diagnostics', async () => {
  const server = child(); const ready = waitForVite(server, { timeoutMs: 20 });
  server.stdout.write('No listening address');
  await assert.rejects(ready, /Vite readiness timed out.*pid=123.*No listening address/);
  assert.equal(server.stdout.listenerCount('data'), 0);
});
