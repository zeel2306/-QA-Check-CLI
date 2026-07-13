import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class KotlinDetector implements FrameworkDetector {
  readonly name = "Kotlin";
  readonly priority = 500;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.findFile((file) => /\.(kt|kts)$/.test(file))) {
      return detected(this.name, context, { language: "Kotlin" });
    }

    return notDetected(this.name);
  }
}
