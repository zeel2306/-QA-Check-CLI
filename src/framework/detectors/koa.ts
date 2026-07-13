import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class KoaDetector implements FrameworkDetector {
  readonly name = "Koa";
  readonly priority = 770;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "koa")) {
      return detected(this.name, context, { version: packageVersion(context, "koa") });
    }

    return notDetected(this.name);
  }
}
