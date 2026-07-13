import {
  assetValidation,
  dartAnalyze,
  dependencyValidation,
  flutterDoctor,
  flutterTest,
  pubspecValidation,
} from "../checks/project.js";
import type { Check } from "../types/result.js";
import { BasePipeline } from "./base.js";

export class FlutterPipeline extends BasePipeline {
  readonly framework = "Flutter";

  checks(): Check[] {
    return [
      flutterDoctor(),
      pubspecValidation(),
      dartAnalyze(),
      flutterTest(),
      dependencyValidation(),
      assetValidation(),
    ];
  }
}
