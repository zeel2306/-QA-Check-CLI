import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class HonoDetector {
    name = "Hono";
    priority = 770;
    detect(context) {
        if (hasDependency(context, "hono")) {
            return detected(this.name, context, { version: packageVersion(context, "hono") });
        }
        return notDetected(this.name);
    }
}
