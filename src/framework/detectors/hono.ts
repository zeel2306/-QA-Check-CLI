import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class HonoDetector implements FrameworkDetector {
  readonly name = "Hono";
  readonly priority = 770;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "hono")) {
      return detected(this.name, context, { version: packageVersion(context, "hono") });
    }

    return notDetected(this.name);
  }
}
