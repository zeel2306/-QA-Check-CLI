import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class BulmaDetector implements FrameworkDetector {
  readonly name = "Bulma";
  readonly priority = 340;

  detect(context: DetectionContext): FrameworkDetectionResult {
    const index = context.readText("index.html") ?? "";

    if (hasDependency(context, "bulma") || /bulma(\.min)?\.css/i.test(index)) {
      return detected(this.name, context, { version: packageVersion(context, "bulma") });
    }

    return notDetected(this.name);
  }
}
