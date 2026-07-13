import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class FastifyDetector implements FrameworkDetector {
  readonly name = "Fastify";
  readonly priority = 770;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "fastify")) {
      return detected(this.name, context, { version: packageVersion(context, "fastify") });
    }

    return notDetected(this.name);
  }
}
