import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasComposerDependency, notDetected } from "../utils.js";

export class DrupalDetector implements FrameworkDetector {
  readonly name = "Drupal";
  readonly priority = 850;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      hasComposerDependency(context, "drupal/core") ||
      context.hasAnyDirectory(["core/modules/system", "sites/default"])
    ) {
      return detected(this.name, context, {
        version: context.composerDependencyVersion("drupal/core"),
        language: "PHP",
        packageManager: context.composerJson ? "composer" : undefined,
      });
    }

    return notDetected(this.name);
  }
}
