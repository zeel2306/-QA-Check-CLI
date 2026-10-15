import fs from 'node:fs/promises';
import path from 'node:path';

/** Resolve npm's JS entrypoint without npm.cmd, shells, or Linux-only readlink. */
export async function resolveNpmCli() {
  const nodeHome = path.dirname(process.execPath);
  const candidates = [process.env.npm_execpath,
    path.join(nodeHome, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeHome, '../lib/node_modules/npm/bin/npm-cli.js')];
  for (const candidate of candidates.filter(Boolean)) {
    try { if ((await fs.stat(candidate)).isFile()) return await fs.realpath(candidate); } catch {}
  }
  throw new Error('Cannot resolve npm CLI; set npm_execpath to npm/bin/npm-cli.js');
}
