import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class NuxtDetector implements FrameworkDetector {
  readonly name = "Nuxt";
  readonly priority = 990;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "nuxt") || context.findFile((file) => /^nuxt\.config\./.test(file))) {
      return detected(this.name, context, { version: packageVersion(context, "nuxt") });
    }

    return notDetected(this.name);
  }
}
