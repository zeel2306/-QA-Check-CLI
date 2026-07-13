import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class GenericPipeline extends BasePipeline {
  readonly framework = "Generic";

  checks(): Check[] {
    return [
      this.typeScript(),
      this.eslint(),
    ];
  }
}
