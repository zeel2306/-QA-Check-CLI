import { detected, notDetected } from "../utils.js";
export class HtmlDetector {
    name = "HTML";
    priority = 100;
    detect(context) {
        if (context.hasFile("index.html") || context.findFile((file) => file.endsWith(".html"))) {
            return detected(this.name, context);
        }
        return notDetected(this.name);
    }
}
