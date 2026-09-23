import chalk from "chalk";

const examples = [
  {
    command: "qa-check .",
    description: "Audit the current project and generate HTML, JSON, Markdown, PDF, screenshots, and history.",
  },
  {
    command: 'qa-check "D:\\Projects\\Phoenix"',
    description: "Audit another project by path.",
  },
  {
    command: "qa-check init",
    description: "Create qa-check.config.json and a GitHub Actions workflow.",
  },
  {
    command: "qa-check . --profile report",
    description: "Generate reports without failing because of QA issues. Best for testing/documentation.",
  },
  {
    command: "qa-check . --profile ci",
    description: "CI mode that fails on FAIL or ERROR checks.",
  },
  {
    command: "qa-check . --profile strict",
    description: "Strict CI mode that fails on warnings, failures, errors, or score below 80.",
  },
  {
    command: "qa-check . --route / --route /about",
    description: "Audit only selected routes.",
  },
  {
    command: "qa-check . --ignore-route /admin --max-routes 20",
    description: "Skip noisy/private routes and limit large projects.",
  },
  {
    command: "qa-check . --no-pdf",
    description: "Skip PDF generation when you only need HTML and JSON.",
  },
  {
    command: "qa-check . --no-markdown",
    description: "Skip the Markdown summary report.",
  },
  {
    command: "qa-check . --no-history",
    description: "Run once without storing report history snapshots.",
  },
];

export function printHelp(): void {
  console.log(chalk.cyan("QA Check CLI"));
  console.log("Framework-aware website QA checks from the terminal.\n");
  console.log(chalk.bold("Usage"));
  console.log("  qa-check [project-path] [options]");
  console.log("  qa-check init [project-path]\n");
  console.log(chalk.bold("Common Commands"));

  for (const example of examples) {
    console.log(`  ${chalk.green(example.command)}`);
    console.log(`    ${chalk.gray(example.description)}`);
  }

  console.log(`\n${chalk.bold("Options")}`);
  console.log("  --profile report|ci|strict   Choose reporting or CI behavior");
  console.log("  --ci                         Return CI exit codes");
  console.log("  --fail-on error|warning|none Set CI failure rule");
  console.log("  --min-score 80               Fail CI below score");
  console.log("  --route /about               Include a route");
  console.log("  --ignore-route /admin        Exclude a route");
  console.log("  --max-routes 20              Limit audited routes");
  console.log("  --output reports             Set report folder");
  console.log("  --no-html | --no-json        Skip report formats");
  console.log("  --markdown | --no-markdown   Enable or skip Markdown report");
  console.log("  --pdf | --no-pdf             Enable or skip PDF report");
  console.log("  --history | --no-history     Enable or skip history tracking");
  console.log("  --baseline report.json       Compare with a previous report");
  console.log("  --no-baseline                Disable baseline comparison");
  console.log("  --help                       Show this help\n");
}

export function printCommandGuide(projectPath: string): void {
  console.log(chalk.cyan("Useful next commands"));
  console.log(chalk.gray("These are optional shortcuts depending on what you want next.\n"));

  const commands = [
    ["Report only", `qa-check "${projectPath}" --profile report`],
    ["CI quality gate", `qa-check "${projectPath}" --profile ci --ci`],
    ["Strict gate", `qa-check "${projectPath}" --profile strict --ci`],
    ["Only key routes", `qa-check "${projectPath}" --route / --route /about`],
    ["Setup config + GitHub Actions", `qa-check init "${projectPath}"`],
    ["Full help", "qa-check --help"],
  ] as const;

  for (const [label, command] of commands) {
    console.log(`${chalk.bold(label.padEnd(28))} ${chalk.green(command)}`);
  }

  console.log("");
}
