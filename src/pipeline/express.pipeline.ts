import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class ExpressPipeline extends BasePipeline {
  readonly framework = "Express";

  checks(): Check[] {
    return [
      this.build(),
      this.eslint(),
      this.typeScript(),
      this.routes(),
      this.seo(),
      this.accessibility(),
      this.lighthouse(),
      this.responsive(),
      this.performance(),
      this.brokenLinks(),
      this.brokenImages(),
      this.consoleErrors(),
      this.networkErrors(),
    ];
  }
}
