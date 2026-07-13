import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class SvelteDetector {
    name = "Svelte";
    priority = 810;
    detect(context) {
        if (hasDependency(context, "svelte") || context.findFile((file) => file.endsWith(".svelte"))) {
            return detected(this.name, context, { version: packageVersion(context, "svelte") });
        }
        return notDetected(this.name);
    }
}
