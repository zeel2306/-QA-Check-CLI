import type { DetectedFramework } from "../framework.js";
import type { PipelineRuntime } from "../pipeline/runtime.js";
import type { QaEngineOptions } from "./engine.js";
import type { logger } from "./logger.js";

export interface QAContext {
  projectPath: string;
  reportDir: string;
  detection: DetectedFramework;
  framework: string;
  language?: string;
  packageManager?: string;
  buildTool?: string;
  pipeline: string;
  config: QaEngineOptions;
  routes: string[];
  logger: typeof logger;
  environment: {
    nodeVersion: string;
    platform: NodeJS.Platform;
    ci: boolean;
  };
  runtime: PipelineRuntime;
  packageJson?: Record<string, unknown>;
}
