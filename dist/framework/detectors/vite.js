import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class ViteDetector {
    name = "Vite";
    priority = 700;
    detect(context) {
        if (hasDependency(context, "vite") || context.findFile((file) => /^vite\.config\./.test(file))) {
            return detected(this.name, context, {
                version: packageVersion(context, "vite"),
                buildTool: "Vite",
            });
        }
        return notDetected(this.name);
    }
}
