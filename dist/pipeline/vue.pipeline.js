import { BasePipeline } from "./base.js";
export class VuePipeline extends BasePipeline {
    framework = "Vue";
    checks() {
        return [
            this.build(),
            this.typeScript("Type Check"),
            this.responsive(),
            this.accessibility(),
            this.lighthouse(),
        ];
    }
}
