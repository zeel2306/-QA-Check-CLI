import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class ReactNativeDetector {
    name = "React Native";
    priority = 940;
    detect(context) {
        const hasNativeFolders = context.hasAnyDirectory(["android", "ios"]);
        const hasReactNativeProjectShape = Boolean(context.packageJson) &&
            hasNativeFolders &&
            (hasDependency(context, "react") ||
                context.hasAnyFile(["metro.config.js", "metro.config.cjs", "babel.config.js"]));
        if (hasDependency(context, "react-native") || hasReactNativeProjectShape) {
            return detected(this.name, context, { version: packageVersion(context, "react-native") });
        }
        return notDetected(this.name);
    }
}
