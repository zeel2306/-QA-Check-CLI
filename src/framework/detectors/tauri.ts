import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class TauriDetector implements FrameworkDetector {
  readonly name = "Tauri";
  readonly priority = 880;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.hasDirectory("src-tauri") || hasDependency(context, "@tauri-apps/cli")) {
      return detected(this.name, context, {
        version: packageVersion(context, "@tauri-apps/cli"),
      });
    }

    return notDetected(this.name);
  }
}
