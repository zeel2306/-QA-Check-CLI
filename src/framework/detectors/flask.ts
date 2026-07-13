import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class FlaskDetector implements FrameworkDetector {
  readonly name = "Flask";
  readonly priority = 760;

  detect(context: DetectionContext): FrameworkDetectionResult {
    const appFile = context.hasFile("app.py") ? context.readText("app.py") : undefined;

    if (
      /from flask|import flask/i.test(appFile ?? "") ||
      Boolean(context.findFile((file) => /requirements.*\.txt$/.test(file) && /flask/i.test(context.readText(file) ?? "")))
    ) {
      return detected(this.name, context, { language: "Python" });
    }

    return notDetected(this.name);
  }
}
