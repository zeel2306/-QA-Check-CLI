import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasComposerDependency, notDetected } from "../utils.js";

export class CodeIgniterDetector implements FrameworkDetector {
  readonly name = "CodeIgniter";
  readonly priority = 840;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      hasComposerDependency(context, "codeigniter4/framework") ||
      context.hasAnyDirectory(["app/Config", "system/CodeIgniter"])
    ) {
      return detected(this.name, context, {
        version: context.composerDependencyVersion("codeigniter4/framework"),
        language: "PHP",
        packageManager: context.composerJson ? "composer" : undefined,
      });
    }

    return notDetected(this.name);
  }
}
