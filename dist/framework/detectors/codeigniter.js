import { detected, hasComposerDependency, notDetected } from "../utils.js";
export class CodeIgniterDetector {
    name = "CodeIgniter";
    priority = 840;
    detect(context) {
        if (hasComposerDependency(context, "codeigniter4/framework") ||
            context.hasAnyDirectory(["app/Config", "system/CodeIgniter"])) {
            return detected(this.name, context, {
                version: context.composerDependencyVersion("codeigniter4/framework"),
                language: "PHP",
                packageManager: context.composerJson ? "composer" : undefined,
            });
        }
        return notDetected(this.name);
    }
}
