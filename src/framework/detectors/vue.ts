import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class VueDetector implements FrameworkDetector {
  readonly name = "Vue";
  readonly priority = 820;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "vue") || context.findFile((file) => file.endsWith(".vue"))) {
      return detected(this.name, context, { version: packageVersion(context, "vue") });
    }

    return notDetected(this.name);
  }
}
