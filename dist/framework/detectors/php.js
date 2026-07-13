import { detected, notDetected } from "../utils.js";
export class PhpDetector {
    name = "PHP Website";
    priority = 400;
    detect(context) {
        if (context.hasFile("index.php") || context.findFile((file) => file.endsWith(".php"))) {
            return detected(this.name, context, {
                language: "PHP",
                packageManager: context.composerJson ? "composer" : undefined,
            });
        }
        return notDetected(this.name);
    }
}
