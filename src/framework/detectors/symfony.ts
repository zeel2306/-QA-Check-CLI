import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasComposerDependency, notDetected } from "../utils.js";

export class SymfonyDetector implements FrameworkDetector {
  readonly name = "Symfony";
  readonly priority = 850;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasComposerDependency(context, "symfony/framework-bundle") || context.hasFile("symfony.lock")) {
      return detected(this.name, context, {
        version: context.composerDependencyVersion("symfony/framework-bundle"),
        language: "PHP",
        packageManager: "composer",
      });
    }

    return notDetected(this.name);
  }
}
