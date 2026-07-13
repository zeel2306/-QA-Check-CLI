import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class GhostDetector {
    name = "Ghost";
    priority = 810;
    detect(context) {
        if (hasDependency(context, "ghost") || context.findFile((file) => file.endsWith(".hbs")) && context.hasFile("package.json")) {
            return detected(this.name, context, { version: packageVersion(context, "ghost") });
        }
        return notDetected(this.name);
    }
}
