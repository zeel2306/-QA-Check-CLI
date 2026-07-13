import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class GhostDetector implements FrameworkDetector {
  readonly name = "Ghost";
  readonly priority = 810;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "ghost") || context.findFile((file) => file.endsWith(".hbs")) && context.hasFile("package.json")) {
      return detected(this.name, context, { version: packageVersion(context, "ghost") });
    }

    return notDetected(this.name);
  }
}
