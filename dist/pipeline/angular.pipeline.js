import { BasePipeline } from "./base.js";
export class AngularPipeline extends BasePipeline {
    framework = "Angular";
    checks() {
        return [
            this.build(),
            this.eslint("Angular Lint"),
            this.typeScript(),
            this.accessibility(),
            this.responsive(),
            this.lighthouse(),
            this.performance(),
        ];
    }
}
