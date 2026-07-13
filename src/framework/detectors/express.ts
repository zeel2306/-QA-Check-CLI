import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class ExpressDetector implements FrameworkDetector {
  readonly name = "Express";
  readonly priority = 780;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "express")) {
      return detected(this.name, context, { version: packageVersion(context, "express") });
    }

    return notDetected(this.name);
  }
}
