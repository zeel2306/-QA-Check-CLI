import { detected, notDetected } from "../utils.js";
export class WordPressDetector {
    name = "WordPress";
    priority = 860;
    detect(context) {
        if (context.hasFile("wp-config.php") ||
            context.hasAnyDirectory(["wp-admin", "wp-content", "wp-includes"]) ||
            context.findFile((file) => file.endsWith("wp-load.php"))) {
            return detected(this.name, context, { language: "PHP" });
        }
        return notDetected(this.name);
    }
}
