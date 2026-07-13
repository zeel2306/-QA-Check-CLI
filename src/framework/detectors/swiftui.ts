import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class SwiftUIDetector implements FrameworkDetector {
  readonly name = "SwiftUI";
  readonly priority = 950;

  detect(context: DetectionContext): FrameworkDetectionResult {
    const hasSwiftUIImport = Boolean(
      context.findFile(
        (file) => file.endsWith(".swift") && Boolean(context.readText(file)?.includes("import SwiftUI"))
      )
    );

    if (hasSwiftUIImport) {
      return detected(this.name, context, { language: "Swift" });
    }

    return notDetected(this.name);
  }
}
