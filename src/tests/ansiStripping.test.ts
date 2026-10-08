import test from "node:test";
import assert from "node:assert/strict";
import { stripAnsi } from "../utils/ansi.js";

test("stripAnsi removes color codes and terminal formatting while preserving Unicode", () => {
  const coloredText = "\u001b[36mReport\u001b[39m        : \u001b[32mPASSED ✅\u001b[39m \u001b[31mFAILED ❌\u001b[39m";
  const clean = stripAnsi(coloredText);
  assert.equal(clean, "Report        : PASSED ✅ FAILED ❌");
});
