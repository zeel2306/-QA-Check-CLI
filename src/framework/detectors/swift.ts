import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class SwiftDetector implements FrameworkDetector {
  readonly name = "Swift";
  readonly priority = 600;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      context.hasFile("Package.swift") ||
      context.findFile((file) => file.endsWith(".xcodeproj/project.pbxproj")) ||
      context.findFile((file) => file.endsWith(".xcworkspace/contents.xcworkspacedata")) ||
      context.findFile((file) => file.endsWith(".swift"))
    ) {
      return detected(this.name, context, { language: "Swift" });
    }

    return notDetected(this.name);
  }
}
