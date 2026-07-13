import { detected, notDetected } from "../utils.js";
export class SwiftDetector {
    name = "Swift";
    priority = 600;
    detect(context) {
        if (context.hasFile("Package.swift") ||
            context.findFile((file) => file.endsWith(".xcodeproj/project.pbxproj")) ||
            context.findFile((file) => file.endsWith(".xcworkspace/contents.xcworkspacedata")) ||
            context.findFile((file) => file.endsWith(".swift"))) {
            return detected(this.name, context, { language: "Swift" });
        }
        return notDetected(this.name);
    }
}
