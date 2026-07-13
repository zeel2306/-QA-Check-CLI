import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class KoaDetector {
    name = "Koa";
    priority = 770;
    detect(context) {
        if (hasDependency(context, "koa")) {
            return detected(this.name, context, { version: packageVersion(context, "koa") });
        }
        return notDetected(this.name);
    }
}
