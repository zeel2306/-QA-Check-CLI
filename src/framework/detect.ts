import { createDetectionContext } from "./context.js";
import { detectors } from "./registry.js";
import { detectBuildTool, detectLanguage, detectPackageManager } from "./utils.js";
import type { DetectedFramework, FrameworkDetectionResult } from "./types.js";

export function detectProjectFramework(projectPath: string = process.cwd()): DetectedFramework {
  const context = createDetectionContext(projectPath);
  const matches = detectors
    .map((detector) => detector.detect(context))
    .filter((result): result is FrameworkDetectionResult & { detected: true } => result.detected)
    .sort((a, b) => {
      const detectorA = detectors.find((detector) => detector.name === a.framework);
      const detectorB = detectors.find((detector) => detector.name === b.framework);
      return (detectorB?.priority ?? 0) - (detectorA?.priority ?? 0);
    });

  const best = matches[0];

  if (!best) {
    return {
      detected: true,
      projectPath: context.projectPath,
      framework: "Unknown",
      language: detectLanguage(context),
      packageManager: detectPackageManager(context),
      buildTool: detectBuildTool(context),
    };
  }

  return {
    detected: true,
    projectPath: context.projectPath,
    framework: best.framework,
    version: best.version,
    language: best.language,
    packageManager: best.packageManager,
    buildTool: best.buildTool,
  };
}

export function detectFramework(projectPath: string = process.cwd()): string {
  return detectProjectFramework(projectPath).framework;
}
