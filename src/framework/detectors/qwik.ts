import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasAnyDependency, notDetected, packageVersion } from "../utils.js";

export class QwikDetector implements FrameworkDetector {
  readonly name = "Qwik";
  readonly priority = 890;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasAnyDependency(context, ["@builder.io/qwik", "@builder.io/qwik-city"])) {
      return detected(this.name, context, {
        version: packageVersion(context, "@builder.io/qwik") ?? packageVersion(context, "@builder.io/qwik-city"),
      });
    }

    return notDetected(this.name);
  }
}
