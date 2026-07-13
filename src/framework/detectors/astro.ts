import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class AstroDetector implements FrameworkDetector {
  readonly name = "Astro";
  readonly priority = 900;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "astro") || context.findFile((file) => /^astro\.config\./.test(file))) {
      return detected(this.name, context, { version: packageVersion(context, "astro") });
    }

    return notDetected(this.name);
  }
}
