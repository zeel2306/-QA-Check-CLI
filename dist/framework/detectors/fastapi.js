import { detected, notDetected } from "../utils.js";
export class FastAPIDetector {
    name = "FastAPI";
    priority = 790;
    detect(context) {
        if (Boolean(context.findFile((file) => file.endsWith(".py") && /from fastapi|import fastapi/i.test(context.readText(file) ?? ""))) ||
            Boolean(context.findFile((file) => /requirements.*\.txt$/.test(file) && /fastapi/i.test(context.readText(file) ?? "")))) {
            return detected(this.name, context, { language: "Python" });
        }
        return notDetected(this.name);
    }
}
