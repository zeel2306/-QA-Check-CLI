import { detected, notDetected } from "../utils.js";
export class SpringBootDetector {
    name = "Spring Boot";
    priority = 830;
    detect(context) {
        const pom = context.readText("pom.xml") ?? "";
        const gradle = context.readText("build.gradle") ?? context.readText("build.gradle.kts") ?? "";
        if (/spring-boot/i.test(pom) || /spring-boot/i.test(gradle)) {
            return detected(this.name, context, {
                language: context.findFile((file) => /\.(kt|kts)$/.test(file)) ? "Kotlin" : "Java",
            });
        }
        return notDetected(this.name);
    }
}
