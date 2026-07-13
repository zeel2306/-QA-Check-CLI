import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class TailwindDetector implements FrameworkDetector {
  readonly name = "Tailwind";
  readonly priority = 360;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "tailwindcss") || context.findFile((file) => /^tailwind\.config\./.test(file))) {
      return detected(this.name, context, { version: packageVersion(context, "tailwindcss") });
    }

    return notDetected(this.name);
  }
}
