import { detected, hasAnyDependency, notDetected, packageVersion } from "../utils.js";
export class NestDetector {
    name = "NestJS";
    priority = 850;
    detect(context) {
        if (hasAnyDependency(context, ["@nestjs/core", "@nestjs/common"])) {
            return detected(this.name, context, {
                version: packageVersion(context, "@nestjs/core") ?? packageVersion(context, "@nestjs/common"),
            });
        }
        return notDetected(this.name);
    }
}
