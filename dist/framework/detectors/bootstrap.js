import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class BootstrapDetector {
    name = "Bootstrap";
    priority = 350;
    detect(context) {
        const index = context.readText("index.html") ?? "";
        if (hasDependency(context, "bootstrap") || /bootstrap(\.min)?\.(css|js)/i.test(index)) {
            return detected(this.name, context, { version: packageVersion(context, "bootstrap") });
        }
        return notDetected(this.name);
    }
}
