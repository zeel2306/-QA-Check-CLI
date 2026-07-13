import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class SvelteKitDetector {
    name = "SvelteKit";
    priority = 980;
    detect(context) {
        if (hasDependency(context, "@sveltejs/kit") || context.hasDirectory(".svelte-kit")) {
            return detected(this.name, context, { version: packageVersion(context, "@sveltejs/kit") });
        }
        return notDetected(this.name);
    }
}
