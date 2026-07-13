import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class BulmaDetector {
    name = "Bulma";
    priority = 340;
    detect(context) {
        const index = context.readText("index.html") ?? "";
        if (hasDependency(context, "bulma") || /bulma(\.min)?\.css/i.test(index)) {
            return detected(this.name, context, { version: packageVersion(context, "bulma") });
        }
        return notDetected(this.name);
    }
}
