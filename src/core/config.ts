import fs from "fs";
import path from "path";
import type { QaEngineOptions } from "./engine.js";

export function loadConfig(
  projectPath: string,
): Partial<QaEngineOptions> {
  const configFile = path.join(
    projectPath,
    "qa-check.config.json",
  );

  if (!fs.existsSync(configFile)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(
      "Failed to read qa-check.config.json",
      error,
    );

    return {};
  }
}