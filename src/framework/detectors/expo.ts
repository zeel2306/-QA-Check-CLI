import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class ExpoDetector implements FrameworkDetector {
  readonly name = "Expo";
  readonly priority = 970;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      hasDependency(context, "expo") ||
      context.hasAnyFile(["app.json", "app.config.js", "app.config.ts"]) && hasDependency(context, "react-native")
    ) {
      return detected(this.name, context, { version: packageVersion(context, "expo") });
    }

    return notDetected(this.name);
  }
}
