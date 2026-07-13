import { detected, notDetected } from "../utils.js";
export class DjangoDetector {
    name = "Django";
    priority = 840;
    detect(context) {
        if (context.hasFile("manage.py") ||
            Boolean(context.findFile((file) => /requirements.*\.txt$/.test(file) && /django/i.test(context.readText(file) ?? ""))) ||
            Boolean(context.findFile((file) => file === "pyproject.toml" && /django/i.test(context.readText(file) ?? "")))) {
            return detected(this.name, context, { language: "Python" });
        }
        return notDetected(this.name);
    }
}
