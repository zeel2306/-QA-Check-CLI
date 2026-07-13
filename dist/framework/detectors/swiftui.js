import { detected, notDetected } from "../utils.js";
export class SwiftUIDetector {
    name = "SwiftUI";
    priority = 950;
    detect(context) {
        const hasSwiftUIImport = Boolean(context.findFile((file) => file.endsWith(".swift") && Boolean(context.readText(file)?.includes("import SwiftUI"))));
        if (hasSwiftUIImport) {
            return detected(this.name, context, { language: "Swift" });
        }
        return notDetected(this.name);
    }
}
