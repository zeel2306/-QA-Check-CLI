import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class AstroDetector {
    name = "Astro";
    priority = 900;
    detect(context) {
        if (hasDependency(context, "astro") || context.findFile((file) => /^astro\.config\./.test(file))) {
            return detected(this.name, context, { version: packageVersion(context, "astro") });
        }
        return notDetected(this.name);
    }
}
