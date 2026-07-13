import { detected, notDetected } from "../utils.js";
export class AndroidDetector {
    name = "Android";
    priority = 650;
    detect(context) {
        if (context.hasAnyFile(["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"]) && context.hasDirectory("app/src/main")) {
            return detected(this.name, context, {
                language: context.findFile((file) => /\.(kt|kts)$/.test(file)) ? "Kotlin" : "Java",
                packageManager: "gradle",
            });
        }
        return notDetected(this.name);
    }
}
