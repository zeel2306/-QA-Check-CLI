import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class TauriDetector {
    name = "Tauri";
    priority = 880;
    detect(context) {
        if (context.hasDirectory("src-tauri") || hasDependency(context, "@tauri-apps/cli")) {
            return detected(this.name, context, {
                version: packageVersion(context, "@tauri-apps/cli"),
            });
        }
        return notDetected(this.name);
    }
}
