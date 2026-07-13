import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class VueDetector {
    name = "Vue";
    priority = 820;
    detect(context) {
        if (hasDependency(context, "vue") || context.findFile((file) => file.endsWith(".vue"))) {
            return detected(this.name, context, { version: packageVersion(context, "vue") });
        }
        return notDetected(this.name);
    }
}
