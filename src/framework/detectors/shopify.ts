import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class ShopifyThemeDetector implements FrameworkDetector {
  readonly name = "Shopify Theme";
  readonly priority = 820;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      context.hasAnyDirectory(["sections", "snippets", "templates", "layout"]) &&
      context.findFile((file) => file.endsWith(".liquid"))
    ) {
      return detected(this.name, context);
    }

    return notDetected(this.name);
  }
}
