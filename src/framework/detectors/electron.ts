import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class ElectronDetector implements FrameworkDetector {
  readonly name = "Electron";
  readonly priority = 870;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "electron")) {
      return detected(this.name, context, { version: packageVersion(context, "electron") });
    }

    return notDetected(this.name);
  }
}
