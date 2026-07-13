import { artisanCheck, bladeValidation, composerValidation, laravelRouteCheck, phpVersionCheck, publicFolderCheck, storagePermissionCheck, } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class LaravelPipeline extends BasePipeline {
    framework = "Laravel";
    checks() {
        return [
            composerValidation(),
            phpVersionCheck(),
            artisanCheck(),
            laravelRouteCheck(),
            bladeValidation(),
            publicFolderCheck(),
            storagePermissionCheck(),
            this.responsive(),
            this.accessibility(),
            this.lighthouse(),
            this.performance(),
            this.brokenLinks(),
            this.brokenImages(),
        ];
    }
}
