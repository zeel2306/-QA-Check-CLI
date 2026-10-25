import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeProject } from "../core/init.js";

test("init generates a supported Node workflow and preserves existing project files", async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "qa-init-runtime-"));
  try {
    const created = await initializeProject(work);
    const workflowPath = path.join(work, ".github/workflows/qa-check.yml");
    const workflow = await fs.readFile(workflowPath, "utf8");
    assert.match(workflow, /NODE_VERSION: '22\.19\.0'/);
    assert.match(workflow, /node-version: \$\{\{ env\.NODE_VERSION \}\}/);
    assert.equal(created.created.length, 2);
    await fs.writeFile(workflowPath, "# existing user workflow\n");
    const repeated = await initializeProject(work);
    assert.equal(repeated.created.length, 0);
    assert.equal(repeated.skipped.length, 2);
    assert.equal(await fs.readFile(workflowPath, "utf8"), "# existing user workflow\n");
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});
