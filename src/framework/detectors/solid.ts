import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasAnyDependency, notDetected, packageVersion } from "../utils.js";

export class SolidDetector implements FrameworkDetector {
  readonly name = "SolidJS";
  readonly priority = 880;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasAnyDependency(context, ["solid-js", "@solidjs/start"])) {
      return detected(this.name, context, {
        version: packageVersion(context, "solid-js") ?? packageVersion(context, "@solidjs/start"),
      });
    }

    return notDetected(this.name);
  }
}
