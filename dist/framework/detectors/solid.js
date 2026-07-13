import { detected, hasAnyDependency, notDetected, packageVersion } from "../utils.js";
export class SolidDetector {
    name = "SolidJS";
    priority = 880;
    detect(context) {
        if (hasAnyDependency(context, ["solid-js", "@solidjs/start"])) {
            return detected(this.name, context, {
                version: packageVersion(context, "solid-js") ?? packageVersion(context, "@solidjs/start"),
            });
        }
        return notDetected(this.name);
    }
}
