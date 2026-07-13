import { detected, hasAnyDependency, notDetected, packageVersion } from "../utils.js";
export class QwikDetector {
    name = "Qwik";
    priority = 890;
    detect(context) {
        if (hasAnyDependency(context, ["@builder.io/qwik", "@builder.io/qwik-city"])) {
            return detected(this.name, context, {
                version: packageVersion(context, "@builder.io/qwik") ?? packageVersion(context, "@builder.io/qwik-city"),
            });
        }
        return notDetected(this.name);
    }
}
