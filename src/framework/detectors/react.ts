import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class ReactDetector implements FrameworkDetector {
  readonly name = "React";
  readonly priority = 800;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "react") || context.findFile((file) => /\.(jsx|tsx)$/.test(file))) {
      return detected(this.name, context, { version: packageVersion(context, "react") });
    }

    return notDetected(this.name);
  }
}
