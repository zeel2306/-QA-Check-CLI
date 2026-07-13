import {
  artisanCheck,
  bladeValidation,
  composerValidation,
  laravelRouteCheck,
  phpVersionCheck,
  publicFolderCheck,
  storagePermissionCheck,
} from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class LaravelPipeline extends BasePipeline {
  readonly framework = "Laravel";

  checks(): Check[] {
    return [
      composerValidation(),
      phpVersionCheck(),
      artisanCheck(),
      laravelRouteCheck(),
      bladeValidation(),
      publicFolderCheck(),
      storagePermissionCheck(),
      this.responsive(),
      this.accessibility(),
      this.lighthouse(),
      this.performance(),
      this.brokenLinks(),
      this.brokenImages(),
    ];
  }
}
