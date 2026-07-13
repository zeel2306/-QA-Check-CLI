import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class TailwindDetector {
    name = "Tailwind";
    priority = 360;
    detect(context) {
        if (hasDependency(context, "tailwindcss") || context.findFile((file) => /^tailwind\.config\./.test(file))) {
            return detected(this.name, context, { version: packageVersion(context, "tailwindcss") });
        }
        return notDetected(this.name);
    }
}
