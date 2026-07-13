import { phpSyntaxCheck, publicFolderCheck } from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class PhpPipeline extends BasePipeline {
  readonly framework = "PHP Website";

  checks(): Check[] {
    return [
      phpSyntaxCheck(),
      publicFolderCheck(),
      this.responsive(),
      this.accessibility(),
      this.brokenLinks(),
    ];
  }
}
