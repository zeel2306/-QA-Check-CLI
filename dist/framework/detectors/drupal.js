import { detected, hasComposerDependency, notDetected } from "../utils.js";
export class DrupalDetector {
    name = "Drupal";
    priority = 850;
    detect(context) {
        if (hasComposerDependency(context, "drupal/core") ||
            context.hasAnyDirectory(["core/modules/system", "sites/default"])) {
            return detected(this.name, context, {
                version: context.composerDependencyVersion("drupal/core"),
                language: "PHP",
                packageManager: context.composerJson ? "composer" : undefined,
            });
        }
        return notDetected(this.name);
    }
}
