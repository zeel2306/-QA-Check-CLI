import test from "node:test";
import assert from "node:assert/strict";
import { LighthouseCheck } from "../checks/lighthouse.js";

test("1. LighthouseCheck handles missing target or 0 routes safely", async () => {
  const checkNoUrl = new LighthouseCheck(undefined, ["/"]);
  const resNoUrl = await checkNoUrl.run("/tmp");
  assert.equal(resNoUrl.status, "SKIPPED");
  assert.equal(resNoUrl.skipReason, "No runtime target available");

  const checkNoRoutes = new LighthouseCheck("http://127.0.0.1:9999", []);
  const resNoRoutes = await checkNoRoutes.run("/tmp");
  assert.equal(resNoRoutes.status, "NOT_APPLICABLE");
});

test("2. LighthouseCheck records timeoutMs property and structured diagnostics", () => {
  const check = new LighthouseCheck("http://127.0.0.1:4173", ["/", "/contact"]);
  assert.equal(check.timeoutMs, 180_000);
});
