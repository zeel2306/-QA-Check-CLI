import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class AngularDetector implements FrameworkDetector {
  readonly name = "Angular";
  readonly priority = 930;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.hasFile("angular.json") || hasDependency(context, "@angular/core")) {
      return detected(this.name, context, { version: packageVersion(context, "@angular/core") });
    }

    return notDetected(this.name);
  }
}
