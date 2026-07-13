import { cssValidation, htmlValidation } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class HtmlPipeline extends BasePipeline {
    framework = "HTML";
    checks() {
        return [
            htmlValidation(),
            cssValidation(),
            this.brokenLinks(),
            this.brokenImages(),
            this.seo(),
            this.accessibility(),
            this.lighthouse(),
            this.responsive(),
        ];
    }
}
