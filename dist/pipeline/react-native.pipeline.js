import { androidValidation, assetValidation, iosValidation, metroValidation, } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class ReactNativePipeline extends BasePipeline {
    framework = "React Native";
    checks() {
        return [
            metroValidation(),
            this.typeScript(),
            this.eslint(),
            androidValidation(),
            iosValidation(),
            assetValidation(),
        ];
    }
}
