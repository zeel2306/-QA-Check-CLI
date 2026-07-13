import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class ElectronDetector {
    name = "Electron";
    priority = 870;
    detect(context) {
        if (hasDependency(context, "electron")) {
            return detected(this.name, context, { version: packageVersion(context, "electron") });
        }
        return notDetected(this.name);
    }
}
