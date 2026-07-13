import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class ExpoDetector {
    name = "Expo";
    priority = 970;
    detect(context) {
        if (hasDependency(context, "expo") ||
            context.hasAnyFile(["app.json", "app.config.js", "app.config.ts"]) && hasDependency(context, "react-native")) {
            return detected(this.name, context, { version: packageVersion(context, "expo") });
        }
        return notDetected(this.name);
    }
}
