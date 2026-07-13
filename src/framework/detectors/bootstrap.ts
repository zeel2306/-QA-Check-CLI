import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class BootstrapDetector implements FrameworkDetector {
  readonly name = "Bootstrap";
  readonly priority = 350;

  detect(context: DetectionContext): FrameworkDetectionResult {
    const index = context.readText("index.html") ?? "";

    if (hasDependency(context, "bootstrap") || /bootstrap(\.min)?\.(css|js)/i.test(index)) {
      return detected(this.name, context, { version: packageVersion(context, "bootstrap") });
    }

    return notDetected(this.name);
  }
}
