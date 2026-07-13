import { assetValidation, packageValidation, swiftBuild, swiftLint } from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class SwiftPipeline extends BasePipeline {
  readonly framework = "Swift";

  checks(): Check[] {
    return [
      swiftBuild(),
      swiftLint(),
      assetValidation(),
      packageValidation(),
    ];
  }
}
