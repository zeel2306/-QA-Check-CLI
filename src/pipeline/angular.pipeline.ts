import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class AngularPipeline extends BasePipeline {
  readonly framework = "Angular";

  checks(): Check[] {
    return [
      this.build(),
      this.eslint("Angular Lint"),
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
