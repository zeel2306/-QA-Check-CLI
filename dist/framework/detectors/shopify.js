import { detected, notDetected } from "../utils.js";
export class ShopifyThemeDetector {
    name = "Shopify Theme";
    priority = 820;
    detect(context) {
        if (context.hasAnyDirectory(["sections", "snippets", "templates", "layout"]) &&
            context.findFile((file) => file.endsWith(".liquid"))) {
            return detected(this.name, context);
        }
        return notDetected(this.name);
    }
}
