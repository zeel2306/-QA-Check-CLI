import { detected, notDetected } from "../utils.js";
export class FlaskDetector {
    name = "Flask";
    priority = 760;
    detect(context) {
        const appFile = context.hasFile("app.py") ? context.readText("app.py") : undefined;
        if (/from flask|import flask/i.test(appFile ?? "") ||
            Boolean(context.findFile((file) => /requirements.*\.txt$/.test(file) && /flask/i.test(context.readText(file) ?? "")))) {
            return detected(this.name, context, { language: "Python" });
        }
        return notDetected(this.name);
    }
}
