import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class SvelteDetector implements FrameworkDetector {
  readonly name = "Svelte";
  readonly priority = 810;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "svelte") || context.findFile((file) => file.endsWith(".svelte"))) {
      return detected(this.name, context, { version: packageVersion(context, "svelte") });
    }

    return notDetected(this.name);
  }
}
