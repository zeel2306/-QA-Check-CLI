import {
  androidValidation,
  assetValidation,
  iosValidation,
  metroValidation,
} from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class ReactNativePipeline extends BasePipeline {
  readonly framework = "React Native";

  checks(): Check[] {
    return [
      metroValidation(),
      this.typeScript(),
      this.eslint(),
      androidValidation(),
      iosValidation(),
      assetValidation(),
    ];
  }
}
