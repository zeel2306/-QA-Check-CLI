import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasComposerDependency, notDetected } from "../utils.js";

export class LaravelDetector implements FrameworkDetector {
  readonly name = "Laravel";
  readonly priority = 960;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (context.hasFile("artisan") || hasComposerDependency(context, "laravel/framework")) {
      return detected(this.name, context, {
        version: context.composerDependencyVersion("laravel/framework"),
        language: "PHP",
        packageManager: "composer",
      });
    }

    return notDetected(this.name);
  }
}
