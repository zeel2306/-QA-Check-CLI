import { detected, notDetected } from "../utils.js";
export class KotlinDetector {
    name = "Kotlin";
    priority = 500;
    detect(context) {
        if (context.findFile((file) => /\.(kt|kts)$/.test(file))) {
            return detected(this.name, context, { language: "Kotlin" });
        }
        return notDetected(this.name);
    }
}
