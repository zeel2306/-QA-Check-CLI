import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";

export class ViteDetector implements FrameworkDetector {
  readonly name = "Vite";
  readonly priority = 700;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (hasDependency(context, "vite") || context.findFile((file) => /^vite\.config\./.test(file))) {
      return detected(this.name, context, {
        version: packageVersion(context, "vite"),
        buildTool: "Vite",
      });
    }

    return notDetected(this.name);
  }
}
