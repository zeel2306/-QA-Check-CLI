import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class RemixDetector implements FrameworkDetector {
  readonly name = "Remix";
  readonly priority = 920;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "@remix-run/react") || hasDependency(context, "@remix-run/node")) {
      return detected(this.name, context, {
        version: packageVersion(context, "@remix-run/react") ?? packageVersion(context, "@remix-run/node"),
      });
    }

    return notDetected(this.name);
  }
}
