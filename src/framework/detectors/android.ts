import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class AndroidDetector implements FrameworkDetector {
  readonly name = "Android";
  readonly priority = 650;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.hasAnyFile(["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"]) && context.hasDirectory("app/src/main")) {
      return detected(this.name, context, {
        language: context.findFile((file) => /\.(kt|kts)$/.test(file)) ? "Kotlin" : "Java",
        packageManager: "gradle",
      });
    }

    return notDetected(this.name);
  }
}
