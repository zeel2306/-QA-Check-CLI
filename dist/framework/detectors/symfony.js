import { detected, hasComposerDependency, notDetected } from "../utils.js";
export class SymfonyDetector {
    name = "Symfony";
    priority = 850;
    detect(context) {
        if (hasComposerDependency(context, "symfony/framework-bundle") || context.hasFile("symfony.lock")) {
            return detected(this.name, context, {
                version: context.composerDependencyVersion("symfony/framework-bundle"),
                language: "PHP",
                packageManager: "composer",
            });
        }
        return notDetected(this.name);
    }
}
