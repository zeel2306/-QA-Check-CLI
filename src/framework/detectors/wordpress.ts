import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class WordPressDetector implements FrameworkDetector {
  readonly name = "WordPress";
  readonly priority = 860;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      context.hasFile("wp-config.php") ||
      context.hasAnyDirectory(["wp-admin", "wp-content", "wp-includes"]) ||
      context.findFile((file) => file.endsWith("wp-load.php"))
    ) {
      return detected(this.name, context, { language: "PHP" });
    }

    return notDetected(this.name);
  }
}
