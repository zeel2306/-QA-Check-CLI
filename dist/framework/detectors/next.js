import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class NextDetector {
    name = "Next.js";
    priority = 1000;
    detect(context) {
        if (hasDependency(context, "next") ||
            context.findFile((file) => /^next\.config\.(js|mjs|cjs|ts)$/.test(file))) {
            return detected(this.name, context, {
                version: packageVersion(context, "next"),
                language: context.findFile((file) => /\.(ts|tsx)$/.test(file)) ? "TypeScript" : undefined,
            });
        }
        return notDetected(this.name);
    }
}
