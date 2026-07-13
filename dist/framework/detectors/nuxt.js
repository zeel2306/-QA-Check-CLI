import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class NuxtDetector {
    name = "Nuxt";
    priority = 990;
    detect(context) {
        if (hasDependency(context, "nuxt") || context.findFile((file) => /^nuxt\.config\./.test(file))) {
            return detected(this.name, context, { version: packageVersion(context, "nuxt") });
        }
        return notDetected(this.name);
    }
}
