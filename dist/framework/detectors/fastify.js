import { detected, hasDependency, notDetected, packageVersion } from "../utils.js";
export class FastifyDetector {
    name = "Fastify";
    priority = 770;
    detect(context) {
        if (hasDependency(context, "fastify")) {
            return detected(this.name, context, { version: packageVersion(context, "fastify") });
        }
        return notDetected(this.name);
    }
}
