import test from "node:test";
import assert from "node:assert/strict";
import { supportsNodeVersion } from "../core/nodeVersion.js";

test("experimental runtime contract rejects Node 20 and old Node 22, accepts 22.19 and 24", () => {
  for (const version of ["20.20.2", "22.14.0", "22.18.9", "22.19.0-rc.1", "invalid"]) assert.equal(supportsNodeVersion(version, ">=22.19"), false, version);
  for (const version of ["22.19.0", "22.19.1", "22.20.0", "24.0.0", "v24.22.0"]) assert.equal(supportsNodeVersion(version, ">=22.19"), true, version);
  assert.equal(supportsNodeVersion("22.19.0", "unknown"), false);
});
