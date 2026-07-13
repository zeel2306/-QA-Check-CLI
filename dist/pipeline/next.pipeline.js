import { BasePipeline } from "./base.js";
export class NextPipeline extends BasePipeline {
    framework = "Next.js";
    checks() {
        return [
            this.build(),
            this.eslint(),
            this.typeScript(),
            this.routes(),
            this.seo(),
            this.lighthouse(),
            this.accessibility(),
            this.responsive(),
            this.performance(),
            this.brokenLinks(),
            this.brokenImages(),
            this.consoleErrors(),
            this.networkErrors(),
        ];
    }
}
