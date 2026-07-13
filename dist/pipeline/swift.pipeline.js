import { assetValidation, packageValidation, swiftBuild, swiftLint } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class SwiftPipeline extends BasePipeline {
    framework = "Swift";
    checks() {
        return [
            swiftBuild(),
            swiftLint(),
            assetValidation(),
            packageValidation(),
        ];
    }
}
