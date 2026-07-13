import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class GatsbyDetector {
    name = "Gatsby";
    priority = 910;
    detect(context) {
        if (hasDependency(context, "gatsby") || context.findFile((file) => /^gatsby-(config|node)\./.test(file))) {
            return detected(this.name, context, { version: packageVersion(context, "gatsby") });
        }
        return notDetected(this.name);
    }
}
