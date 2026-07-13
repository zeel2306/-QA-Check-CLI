import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class VuePipeline extends BasePipeline {
  readonly framework = "Vue";

  checks(): Check[] {
    return [
      this.build(),
      this.typeScript("Type Check"),
      this.responsive(),
      this.accessibility(),
      this.lighthouse(),
    ];
  }
}
