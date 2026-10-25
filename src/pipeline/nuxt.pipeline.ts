import type { Check } from "../types/result.js";
import { VuePipeline } from "./vue.pipeline.js";

export class NuxtPipeline extends VuePipeline {
  override readonly framework: string = "Nuxt";
}
