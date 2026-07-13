import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class ReactPipeline extends BasePipeline {
  readonly framework: string = "React";

  checks(): Check[] {
    return [
      this.build(),
      this.eslint(),
      this.typeScript(),
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
