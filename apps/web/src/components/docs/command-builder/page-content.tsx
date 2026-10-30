import Link from "next/link";
import type { DocumentationPage } from "../types";
import { CommandBuilder } from "./command-builder";

export const commandBuilderPage: DocumentationPage = {
  slug: "command-builder",
  title: "The right command. Ready to copy.",
  eyebrow: "TOOLS / COMMAND BUILDER",
  description: "Choose a task, tune its verified options, and copy a command for your own PowerShell terminal. No execution, local-file access, or backend connection.",
  sections: [
    { id: "build-command", title: "Build your command", body: <CommandBuilder /> },
    {
      id: "builder-scope", title: "Supported scope & limitations", body: <>
        <p>This browser-only tool targets the CLI v2.0.0 parser and PowerShell 7+. It generates canonical audit, init, fix, doctor, compare, api, test, and flow forms; aliases autofix/e2e remain available in the CLI. Compare requires two report paths here; flow requires an explicit file or directory.</p>
        <p>The audit controls cover report/ci/strict profiles, CI policies, route selection, output directory, report formats, local history, and baseline comparison. Other CLI options, including fast/full profiles, custom URLs, debug output, and Lighthouse budgets, remain in the <Link href="/docs/commands">command reference</Link>. Supported commands load project configuration themselves; no config-file flag is generated.</p>
        <p>Literal path validation excludes shell variables, operators, wildcards, URLs, credentials, and leading hyphens. Prefix a project named after a CLI command (for example init) with ./ when auditing it. Paths are not checked for existence. Verify filesystem access, browser readiness, configuration, and report generation when you run the command.</p>
        <p>Generated text is for review in your own terminal. This tool does not execute scans, install Git hooks, or upload reports. For the separate SaaS import workflow, see <Link href="/docs#upload">Report uploads</Link>. For execution problems, see <Link href="/docs/troubleshooting">Troubleshooting</Link>.</p>
      </>,
    },
  ],
};
