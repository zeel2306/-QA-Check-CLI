import { detected, hasComposerDependency, notDetected } from "../utils.js";
export class LaravelDetector {
    name = "Laravel";
    priority = 960;
    detect(context) {
        if (context.hasFile("artisan") || hasComposerDependency(context, "laravel/framework")) {
            return detected(this.name, context, {
                version: context.composerDependencyVersion("laravel/framework"),
                language: "PHP",
                packageManager: "composer",
            });
        }
        return notDetected(this.name);
    }
}
