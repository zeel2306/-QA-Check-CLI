import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class ReactDetector {
    name = "React";
    priority = 800;
    detect(context) {
        if (hasDependency(context, "react") || context.findFile((file) => /\.(jsx|tsx)$/.test(file))) {
            return detected(this.name, context, { version: packageVersion(context, "react") });
        }
        return notDetected(this.name);
    }
}
