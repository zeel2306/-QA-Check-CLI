import { AngularPipeline } from "./angular.pipeline.js";
import { AstroPipeline } from "./astro.pipeline.js";
import { GenericPipeline } from "./generic.pipeline.js";
import { FlutterPipeline } from "./flutter.pipeline.js";
import { HtmlPipeline } from "./html.pipeline.js";
import { LaravelPipeline } from "./laravel.pipeline.js";
import { NextPipeline } from "./next.pipeline.js";
import { PhpPipeline } from "./php.pipeline.js";
import { ReactNativePipeline } from "./react-native.pipeline.js";
import { ReactPipeline } from "./react.pipeline.js";
import { SwiftPipeline } from "./swift.pipeline.js";
import { VitePipeline } from "./vite.pipeline.js";
import { VuePipeline } from "./vue.pipeline.js";
import { WordPressPipeline } from "./wordpress.pipeline.js";
const PIPELINES = {
    "Next.js": NextPipeline,
    React: ReactPipeline,
    Vite: VitePipeline,
    Vue: VuePipeline,
    Nuxt: VuePipeline,
    Angular: AngularPipeline,
    Astro: AstroPipeline,
    Laravel: LaravelPipeline,
    WordPress: WordPressPipeline,
    "PHP Website": PhpPipeline,
    Flutter: FlutterPipeline,
    Expo: ReactNativePipeline,
    "React Native": ReactNativePipeline,
    Swift: SwiftPipeline,
    SwiftUI: SwiftPipeline,
    HTML: HtmlPipeline,
    Bootstrap: HtmlPipeline,
    Tailwind: HtmlPipeline,
    Bulma: HtmlPipeline,
};
export class PipelineFactory {
    static create(detection, runtime) {
        const PipelineClass = PIPELINES[detection.framework] ?? GenericPipeline;
        return new PipelineClass(runtime);
    }
}
