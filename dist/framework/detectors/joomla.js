import { detected, hasComposerDependency, notDetected } from "../utils.js";
export class JoomlaDetector {
    name = "Joomla";
    priority = 850;
    detect(context) {
        if (hasComposerDependency(context, "joomla/joomla-cms") ||
            context.hasAnyFile(["configuration.php", "administrator/manifests/files/joomla.xml"])) {
            return detected(this.name, context, {
                version: context.composerDependencyVersion("joomla/joomla-cms"),
                language: "PHP",
            });
        }
        return notDetected(this.name);
    }
}
