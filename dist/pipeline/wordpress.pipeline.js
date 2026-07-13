import { phpSyntaxCheck, pluginValidation, themeValidation } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class WordPressPipeline extends BasePipeline {
    framework = "WordPress";
    checks() {
        return [
            themeValidation(),
            pluginValidation(),
            phpSyntaxCheck(),
            this.responsive(),
            this.accessibility(),
            this.seo(),
            this.lighthouse(),
            this.brokenLinks(),
        ];
    }
}
