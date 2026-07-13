import { detected, notDetected } from "../utils.js";
export class AspNetDetector {
    name = "ASP.NET";
    priority = 830;
    detect(context) {
        if (context.findFile((file) => file.endsWith(".csproj") && /Microsoft\.NET\.Sdk\.Web|Microsoft\.AspNetCore/i.test(context.readText(file) ?? "")) ||
            context.hasAnyFile(["Program.cs", "Startup.cs"])) {
            return detected(this.name, context, { language: "C#" });
        }
        return notDetected(this.name);
    }
}
