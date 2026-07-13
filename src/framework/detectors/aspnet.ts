import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class AspNetDetector implements FrameworkDetector {
  readonly name = "ASP.NET";
  readonly priority = 830;

  detect(context: DetectionContext): FrameworkDetectionResult {
    if (
      context.findFile((file) => file.endsWith(".csproj") && /Microsoft\.NET\.Sdk\.Web|Microsoft\.AspNetCore/i.test(context.readText(file) ?? "")) ||
      context.hasAnyFile(["Program.cs", "Startup.cs"])
    ) {
      return detected(this.name, context, { language: "C#" });
    }

    return notDetected(this.name);
  }
}
