import { runBuild } from "../build.js";
import { AccessibilityCheck } from "../checks/accessibility.js";
import { BrokenImagesCheck } from "../checks/brokenImages.js";
import { BrokenLinksCheck } from "../checks/brokenLinks.js";
import { CommandCheck } from "../checks/command.js";
import { ConsoleErrorsCheck } from "../checks/consoleErrors.js";
import { NetworkCheck } from "../checks/network.js";
import { PerformanceCheck } from "../checks/performance.js";
import { ResponsiveCheck } from "../checks/responsive.js";
import { SeoCheck } from "../checks/seo.js";
import { runLint } from "../lint.js";
import { runTypeScript } from "../typescript.js";
import { LazyLighthouseCheck, RouteDiscoveryCheck } from "./runtime.js";
export class BasePipeline {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    build() {
        return new CommandCheck("Build", runBuild);
    }
    eslint(name = "ESLint") {
        return new CommandCheck(name, runLint);
    }
    typeScript(name = "TypeScript") {
        return new CommandCheck(name, runTypeScript);
    }
    routes() {
        return new RouteDiscoveryCheck(this.runtime);
    }
    responsive() {
        return new ResponsiveCheck(() => this.runtime.browserAudit());
    }
    seo() {
        return new SeoCheck(() => this.runtime.browserAudit());
    }
    accessibility() {
        return new AccessibilityCheck(() => this.runtime.browserAudit());
    }
    performance() {
        return new PerformanceCheck(() => this.runtime.browserAudit());
    }
    brokenLinks() {
        return new BrokenLinksCheck(() => this.runtime.browserAudit());
    }
    brokenImages() {
        return new BrokenImagesCheck(() => this.runtime.browserAudit());
    }
    consoleErrors() {
        return new ConsoleErrorsCheck(() => this.runtime.browserAudit());
    }
    networkErrors() {
        return new NetworkCheck(() => this.runtime.browserAudit());
    }
    lighthouse() {
        return new LazyLighthouseCheck(this.runtime);
    }
}
