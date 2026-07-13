import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class FastAPIDetector implements FrameworkDetector {
  readonly name = "FastAPI";
  readonly priority = 790;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      Boolean(context.findFile((file) => file.endsWith(".py") && /from fastapi|import fastapi/i.test(context.readText(file) ?? ""))) ||
      Boolean(context.findFile((file) => /requirements.*\.txt$/.test(file) && /fastapi/i.test(context.readText(file) ?? "")))
    ) {
      return detected(this.name, context, { language: "Python" });
    }

    return notDetected(this.name);
  }
}
