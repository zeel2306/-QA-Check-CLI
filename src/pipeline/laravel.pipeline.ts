import {
  artisanCheck,
  bladeValidation,
  composerValidation,
  laravelRouteCheck,
  phpVersionCheck,
  publicFolderCheck,
  storagePermissionCheck,
} from "../checks/project.js";
import { LaravelSecurityCheck } from "../checks/laravelSecurity.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class LaravelPipeline extends BasePipeline {
  readonly framework = "Laravel";

  checks(): Check[] {
    return [
      this.routes(),
      composerValidation(),
      phpVersionCheck(),
      artisanCheck(),
      laravelRouteCheck(),
      bladeValidation(),
      publicFolderCheck(),
      storagePermissionCheck(),
      new LaravelSecurityCheck(),
      this.apiTesting(),
      this.responsive(),
      this.accessibility(),
      this.lighthouse(),
      this.performance(),
      this.brokenLinks(),
      this.brokenImages(),
    ];
  }
}
