import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class ExpressDetector {
    name = "Express";
    priority = 780;
    detect(context) {
        if (hasDependency(context, "express")) {
            return detected(this.name, context, { version: packageVersion(context, "express") });
        }
        return notDetected(this.name);
    }
}
