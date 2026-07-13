import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class GatsbyDetector implements FrameworkDetector {
  readonly name = "Gatsby";
  readonly priority = 910;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "gatsby") || context.findFile((file) => /^gatsby-(config|node)\./.test(file))) {
      return detected(this.name, context, { version: packageVersion(context, "gatsby") });
    }

    return notDetected(this.name);
  }
}
