import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class VuePipeline extends BasePipeline {
  readonly framework: string = "Vue";

  checks(): Check[] {
    return [
      this.build(),
      this.eslint(),
      this.typeScript(),
      this.codeQuality(),
      this.routes(),
      this.responsive(),
      this.accessibility(),
      this.lighthouse(),
      this.performance(),
      this.brokenLinks(),
      this.brokenImages(),
      this.consoleErrors(),
      this.networkErrors(),
    ];
  }
}
