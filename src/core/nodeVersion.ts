import fs from "node:fs";

/** The release contract is a minimum stable Node version, read from this installation. */
export function supportsNodeVersion(version: string, engine: string): boolean {
  const required = /^>=(\d+)\.(\d+)(?:\.(\d+))?$/.exec(engine);
  const actual = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!required || !actual) return false;
  for (let index = 1; index <= 3; index++) {
    const difference = Number(actual[index]) - Number(required[index] ?? 0);
    if (difference) return difference > 0;
  }
  return true;
}

export function requireSupportedNode(): void {
  const metadata = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  if (!supportsNodeVersion(process.versions.node, metadata.engines.node)) {
    console.error(`QA Check CLI requires Node.js ${metadata.engines.node}; found ${process.version}. Install a supported Node.js version before running this CLI.`);
    process.exit(1);
  }
}
