import { phpSyntaxCheck, publicFolderCheck } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class PhpPipeline extends BasePipeline {
    framework = "PHP Website";
    checks() {
        return [
            phpSyntaxCheck(),
            publicFolderCheck(),
            this.responsive(),
            this.accessibility(),
            this.brokenLinks(),
        ];
    }
}
