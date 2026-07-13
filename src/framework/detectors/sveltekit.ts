import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class SvelteKitDetector implements FrameworkDetector {
  readonly name = "SvelteKit";
  readonly priority = 980;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "@sveltejs/kit") || context.hasDirectory(".svelte-kit")) {
      return detected(this.name, context, { version: packageVersion(context, "@sveltejs/kit") });
    }

    return notDetected(this.name);
  }
}
