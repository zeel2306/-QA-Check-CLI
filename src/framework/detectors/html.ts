import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class HtmlDetector implements FrameworkDetector {
  readonly name = "HTML";
  readonly priority = 100;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.hasFile("index.html") || context.findFile((file) => file.endsWith(".html"))) {
      return detected(this.name, context);
    }

    return notDetected(this.name);
  }
}
