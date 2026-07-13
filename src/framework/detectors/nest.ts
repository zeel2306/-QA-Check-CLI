import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasAnyDependency, notDetected, packageVersion } from "../utils.js";

export class NestDetector implements FrameworkDetector {
  readonly name = "NestJS";
  readonly priority = 850;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasAnyDependency(context, ["@nestjs/core", "@nestjs/common"])) {
      return detected(this.name, context, {
        version: packageVersion(context, "@nestjs/core") ?? packageVersion(context, "@nestjs/common"),
      });
    }

    return notDetected(this.name);
  }
}
