import { BasePipeline } from "./base.js";
export class GenericPipeline extends BasePipeline {
    framework = "Generic";
    checks() {
        return [
            this.typeScript(),
            this.eslint(),
        ];
    }
}
