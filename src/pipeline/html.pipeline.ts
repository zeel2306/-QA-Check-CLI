import { cssValidation, htmlValidation } from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class HtmlPipeline extends BasePipeline {
  readonly framework = "HTML";

  checks(): Check[] {
    return [
      htmlValidation(),
      cssValidation(),
      this.brokenLinks(),
      this.brokenImages(),
      this.seo(),
      this.accessibility(),
      this.lighthouse(),
      this.responsive(),
    ];
  }
}
