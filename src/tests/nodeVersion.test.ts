import test from "node:test";
import assert from "node:assert/strict";
import { supportsNodeVersion } from "../core/nodeVersion.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

test("experimental runtime contract rejects Node 20 and old Node 22, accepts 22.19 and 24", () => {
  for (const version of ["20.20.2", "22.14.0", "22.18.9", "22.19.0-rc.1", "invalid"]) assert.equal(supportsNodeVersion(version, ">=22.19"), false, version);
  for (const version of ["22.19.0", "22.19.1", "22.20.0", "24.0.0", "v24.22.0"]) assert.equal(supportsNodeVersion(version, ">=22.19"), true, version);
  assert.equal(supportsNodeVersion("22.19.0", "unknown"), false);
});

test("public executable checks runtime before importing application initialization", async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "qa-runtime-order-"));
  try {
    // Inject an unsupported runtime decision without depending on another Node installation.
    // Loading the application first must fail even when --version is requested.
    const loader = path.join(work, "guard.mjs");
    await fs.writeFile(loader, `export async function resolve(s,c,next) {
      if (s.endsWith('/dist/core/nodeVersion.js') || s === '../dist/core/nodeVersion.js')
        return {url:'data:text/javascript,'+encodeURIComponent('export function requireSupportedNode(){console.error("runtime guard reached");process.exit(1)}'),shortCircuit:true};
      if (s.endsWith('/dist/index.js')) throw Error('Application initialized before runtime rejection');
      return next(s,c);
    }`);
    const bin = fileURLToPath(new URL("../../bin/qa-check.js", import.meta.url));
    for (const command of ["--version", "--help", "."]) {
      const result = spawnSync(process.execPath, ["--loader", pathToFileURL(loader).href, bin, command], { cwd: work, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /runtime guard reached/);
      assert.doesNotMatch(result.stderr, /Application initialized before runtime rejection/);
      assert.equal(result.stdout, "");
    }
    assert.deepEqual(await fs.readdir(work), ["guard.mjs"]);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});
