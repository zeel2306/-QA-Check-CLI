import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class NextPipeline extends BasePipeline {
  readonly framework: string = "Next.js";

  checks(): Check[] {
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
