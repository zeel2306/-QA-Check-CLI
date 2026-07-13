import type { DetectionContext, FrameworkDetector, FrameworkDetectionResult } from "../types.js";
import { detected, notDetected } from "../utils.js";

export class SpringBootDetector implements FrameworkDetector {
  readonly name = "Spring Boot";
  readonly priority = 830;

  detect(context: DetectionContext): FrameworkDetectionResult {
    const pom = context.readText("pom.xml") ?? "";
    const gradle = context.readText("build.gradle") ?? context.readText("build.gradle.kts") ?? "";

    if (/spring-boot/i.test(pom) || /spring-boot/i.test(gradle)) {
      return detected(this.name, context, {
        language: context.findFile((file) => /\.(kt|kts)$/.test(file)) ? "Kotlin" : "Java",
      });
    }

    return notDetected(this.name);
  }
}
