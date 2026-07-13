import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class AngularDetector {
    name = "Angular";
    priority = 930;
    detect(context) {
        if (context.hasFile("angular.json") || hasDependency(context, "@angular/core")) {
            return detected(this.name, context, { version: packageVersion(context, "@angular/core") });
        }
        return notDetected(this.name);
    }
}
