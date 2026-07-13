import { detected, notDetected } from "../utils.js";
export class FlutterDetector {
    name = "Flutter";
    priority = 945;
    detect(context) {
        const pubspec = context.readText("pubspec.yaml") ?? "";
        if (context.hasFile("pubspec.yaml") &&
            (/\n\s*flutter\s*:/i.test(`\n${pubspec}`) ||
                /sdk\s*:\s*flutter/i.test(pubspec) ||
                context.hasDirectory("lib"))) {
            return detected(this.name, context, { language: "Dart" });
        }
        return notDetected(this.name);
    }
}
