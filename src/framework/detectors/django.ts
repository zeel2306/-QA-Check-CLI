import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class DjangoDetector implements FrameworkDetector {
  readonly name = "Django";
  readonly priority = 840;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      context.hasFile("manage.py") ||
      Boolean(context.findFile((file) => /requirements.*\.txt$/.test(file) && /django/i.test(context.readText(file) ?? ""))) ||
      Boolean(context.findFile((file) => file === "pyproject.toml" && /django/i.test(context.readText(file) ?? "")))
    ) {
      return detected(this.name, context, { language: "Python" });
    }

    return notDetected(this.name);
  }
}
