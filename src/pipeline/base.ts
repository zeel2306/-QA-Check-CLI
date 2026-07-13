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
import type { Check } from "../types/result.js";
import { LazyLighthouseCheck, PipelineRuntime, RouteDiscoveryCheck } from "./runtime.js";

export interface Pipeline {
  framework: string;
  checks(): Check[];
}

export abstract class BasePipeline implements Pipeline {
  abstract readonly framework: string;

  constructor(protected readonly runtime: PipelineRuntime) {}

  abstract checks(): Check[];

  protected build(): Check {
    return new CommandCheck("Build", runBuild);
  }

  protected eslint(name = "ESLint"): Check {
    return new CommandCheck(name, runLint);
  }

  protected typeScript(name = "TypeScript"): Check {
    return new CommandCheck(name, runTypeScript);
  }

  protected routes(): Check {
    return new RouteDiscoveryCheck(this.runtime);
  }

  protected responsive(): Check {
    return new ResponsiveCheck(() => this.runtime.browserAudit());
  }

  protected seo(): Check {
    return new SeoCheck(() => this.runtime.browserAudit());
  }

  protected accessibility(): Check {
    return new AccessibilityCheck(() => this.runtime.browserAudit());
  }

  protected performance(): Check {
    return new PerformanceCheck(() => this.runtime.browserAudit());
  }

  protected brokenLinks(): Check {
    return new BrokenLinksCheck(() => this.runtime.browserAudit());
  }

  protected brokenImages(): Check {
    return new BrokenImagesCheck(() => this.runtime.browserAudit());
  }

  protected consoleErrors(): Check {
    return new ConsoleErrorsCheck(() => this.runtime.browserAudit());
  }

  protected networkErrors(): Check {
    return new NetworkCheck(() => this.runtime.browserAudit());
  }

  protected lighthouse(): Check {
    return new LazyLighthouseCheck(this.runtime);
  }
}
