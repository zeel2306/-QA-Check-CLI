import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class PhpDetector implements FrameworkDetector {
  readonly name = "PHP Website";
  readonly priority = 400;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.hasFile("index.php") || context.findFile((file) => file.endsWith(".php"))) {
      return detected(this.name, context, {
        language: "PHP",
        packageManager: context.composerJson ? "composer" : undefined,
      });
    }

    return notDetected(this.name);
  }
}
