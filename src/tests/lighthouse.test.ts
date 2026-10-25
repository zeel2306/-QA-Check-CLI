import test from "node:test";
import assert from "node:assert/strict";
import { LighthouseCheck } from "../checks/lighthouse.js";

test("LighthouseCheck handles missing target or 0 pages safely without reporting fake PASS/FAIL", async () => {
  // Case 1: No baseUrl provided -> SKIPPED
  const checkNoUrl = new LighthouseCheck(undefined, []);
  const resultNoUrl = await checkNoUrl.run("/tmp");

  assert.equal(resultNoUrl.status, "SKIPPED", "No baseUrl must return SKIPPED");
  assert.equal(resultNoUrl.score, null, "No baseUrl score must be null");
  assert.equal(resultNoUrl.pagesCompleted, 0, "pagesCompleted must be 0");

  // Case 2: Unreachable server URL -> ERROR (never PASS or score 0 FAIL)
  const checkUnreachable = new LighthouseCheck("http://127.0.0.1:99999", ["/"]);
  const resultUnreachable = await checkUnreachable.run("/tmp");

  assert.ok(
    resultUnreachable.status === "ERROR" || resultUnreachable.status === "SKIPPED",
    `Unreachable server status must be ERROR or SKIPPED, got ${resultUnreachable.status}`
  );
  assert.equal(resultUnreachable.score, null, "Unreachable server score must be null");
  assert.equal(resultUnreachable.pagesCompleted, 0, "pagesCompleted must be 0");
});
