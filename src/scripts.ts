import fs from "fs";
import path from "path";

export function hasScript(
  projectPath: string,
  script: string
) {
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  return !!pkg.scripts?.[script];
}
