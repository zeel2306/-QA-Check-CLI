import fs from 'node:fs/promises';
import path from 'node:path';

/** Callers supply canonical absolute paths; other volumes are external too. */
export function isOutsideDirectory(root, target, api = path) {
  if (!api.isAbsolute(root) || !api.isAbsolute(target)) return false;
  const relative = api.relative(root, target);
  return relative === '..' || relative.startsWith('..' + api.sep) || api.isAbsolute(relative);
}

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
