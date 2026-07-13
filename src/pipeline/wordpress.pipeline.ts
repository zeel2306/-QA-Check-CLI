import { phpSyntaxCheck, pluginValidation, themeValidation } from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class WordPressPipeline extends BasePipeline {
  readonly framework = "WordPress";

  checks(): Check[] {
    return [
      themeValidation(),
      pluginValidation(),
      phpSyntaxCheck(),
      this.responsive(),
      this.accessibility(),
      this.seo(),
      this.lighthouse(),
      this.brokenLinks(),
    ];
  }
}
