import { commandMetadata, profileDefaults, reportFormats, type BuilderState } from "./metadata";

export interface BuildResult {
  command: string | null;
  args: string[];
  errors: Record<string, string>;
  explanation: string;
  selections: { option: string; meaning: string }[];
  outputs: string[];
  warnings: string[];
}

/** PowerShell 7+ literal argument quoting. This is serialization, never execution. */
export function quotePowerShellArgument(value: string): string {
  return /^[A-Za-z0-9_./\\:-]+$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
}

const reservedAuditPaths = new Set(["init", "fix", "autofix", "doctor", "compare", "api", "test", "e2e", "flow", "help"]);
const credentialPattern = /(?:\b(?:password|passwd|token|secret|api[_-]?key)\s*[:=]|\bBearer\s|\b(?:sk-|ghp_|github_pat_))/i;

function pathError(value: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return "Enter a nonempty filesystem path for this field.";
  if (value !== value.trim()) return "Remove leading or trailing whitespace. Spaces inside a path are supported.";
  if (value.length > 500) return "This builder supports paths up to 500 characters.";
  if (credentialPattern.test(value)) return "Do not enter credentials or tokens. This field accepts a filesystem path only.";
  if (value.startsWith("-")) return "Paths cannot start with a hyphen here. Prefix a relative path with ./ instead.";
  if (!/^[\p{L}\p{N} _./\\:'-]+$/u.test(value)) return "Use a literal path with letters, numbers, spaces, dots, slashes, hyphens, underscores, or apostrophes. Shell operators, variables, wildcards, and control characters are not accepted.";
  if (value.includes(":") && (!/^[A-Za-z]:[\\/]/.test(value) || value.slice(2).includes(":"))) return "Use a filesystem path, not a URL, provider path, or credential value.";
}

/** Accept a deliberately small literal-route subset; serialize route lists once. */
function routes(value: string): { values: string[]; error?: string } {
  if (typeof value !== "string") return { values: [], error: "Enter comma-separated literal route paths." };
  if (!value.trim()) return { values: [] };
  const items = value.split(",").map(item => item.trim());
  if (items.some(item => !item || credentialPattern.test(item) || !/^\/[\p{L}\p{N}_./%~-]*$/u.test(item) || item.startsWith("//") || /%(?![\da-f]{2})/i.test(item))) {
    return { values: [], error: "Use nonempty paths such as / or /about, separated by commas. Queries, fragments, credentials, wildcards, and shell syntax are excluded." };
  }
  return { values: [...new Set(items)] };
}

export function buildCommand(state: BuilderState): BuildResult {
  const result: BuildResult = { command: null, args: [], errors: {}, explanation: "", selections: [], outputs: [], warnings: [] };
  const meta = commandMetadata.find(item => item.id === state.command);
  if (!meta) { result.errors.command = "Select a supported command."; return result; }
  result.explanation = meta.effect;
  const path = (field: string, value: string) => {
    const error = pathError(value);
    if (error) result.errors[field] = error;
    return value;
  };
  const add = (flag: string, value: string | undefined, meaning: string) => {
    result.args.push(flag);
    if (value !== undefined) result.args.push(value);
    result.selections.push({ option: value === undefined ? flag : `${flag} ${quotePowerShellArgument(value)}`, meaning });
  };
  if (state.command === "compare") {
    result.args.push("compare", path("previousReport", state.previousReport), path("currentReport", state.currentReport));
    if (state.previousReport === state.currentReport) result.warnings.push("Both report paths are identical. Select different saved scans to review changes.");
    result.outputs.push("Console comparison and regression-gate exit code; no new audit report is generated.");
  } else if (state.command === "flow") {
    result.args.push("flow", path("flowTarget", state.flowTarget));
    result.warnings.push("Run from the intended project directory. The flow target does not change the runtime's working directory.");
    result.outputs.push("Console flow and step results; no normal audit report generation.");
  } else {
    path("project", state.project);
    if (state.command === "audit") {
      if (reservedAuditPaths.has(state.project)) result.errors.project = "This path is a CLI command word. Use ./ before the project name to select a project with that name.";
    } else result.args.push(state.command);
    result.args.push(state.project);
    if (state.command === "fix") {
      if (typeof state.dryRun !== "boolean") result.errors.dryRun = "Choose whether to preview fixes.";
      if (state.dryRun) add("--dry-run", undefined, "Preview fixes without writing source files.");
      else result.warnings.push("This command writes source fixes. Review changes carefully in your own terminal; the browser never applies them.");
      result.outputs.push(state.dryRun ? "Console fix preview; no source files are written." : "Updated supported source files and a console fix summary.");
    }
    if (state.command === "init") result.outputs.push("Missing qa-check.config.json and .github/workflows/qa-check.yml starter files; existing files are skipped.");
    if (state.command === "doctor") result.outputs.push("Console diagnostics; doctor may create reports/ and its temporary permission probe.");
    if (state.command === "api") { result.outputs.push("Console API case results; no normal audit reports."); result.warnings.push("Requires configured api cases. Requests may mutate services if those cases use write methods. Only test endpoints you control."); }
    if (state.command === "test") result.outputs.push("Console flow/step results using configured flows; requires Playwright and a ready application.");
  }
  if (state.command === "audit") {
    const a = state.audit;
    const defaults = profileDefaults[a.profile];
    if (!Object.hasOwn(profileDefaults, a.profile)) result.errors.profile = "Choose report, ci, or strict. Other CLI profiles are outside this builder's initial scope.";
    else add("--profile", a.profile, `Profile default: failOn=${defaults.failOn}, minScore=${defaults.minScore}${defaults.ci ? ", with CI exit codes" : ""}.`);
    const ci = Boolean(defaults?.ci || a.ci);
    if (a.ci && !defaults?.ci) add("--ci", undefined, "Return the audit's configured quality-gate exit code.");
    if (!["profile", "none", "error", "warning"].includes(a.failOn)) result.errors.failOn = "Choose a supported failure policy.";
    if (!ci && (a.failOn !== "profile" || a.minScore !== "")) result.errors.ci = "Enable CI exit codes before setting exit-policy overrides.";
    if (ci && a.failOn !== "profile" && ["none", "error", "warning"].includes(a.failOn)) add("--fail-on", a.failOn, "Override which finding statuses cause a nonzero CI exit code.");
    if (a.minScore !== "") {
      const number = Number(a.minScore);
      if (typeof a.minScore !== "string" || !a.minScore.trim() || !Number.isFinite(number) || number < 0 || number > 100) result.errors.minScore = "Enter a finite score from 0 to 100.";
      else add("--min-score", String(number), "Return a CI score-threshold failure when the overall score is below this value.");
    }
    if (a.output !== "") add("--output", path("output", a.output), "Write enabled reports under this directory, relative to the detected project unless absolute.");
    const included = routes(a.routes), ignored = routes(a.ignoreRoutes);
    if (included.error) result.errors.routes = included.error;
    if (ignored.error) result.errors.ignoreRoutes = ignored.error;
    if (included.values.some(item => ignored.values.includes(item))) result.errors.ignoreRoutes = "A literal route cannot be both included and ignored in this builder.";
    if (included.values.length) add("--route", included.values.join(","), "Include this comma-separated route selection.");
    if (ignored.values.length) add("--ignore-route", ignored.values.join(","), "Exclude this comma-separated route selection.");
    const integer = (field: "maxRoutes" | "historyLimit", flag: string, meaning: string) => {
      const raw = a[field];
      if (raw !== "") {
        const number = Number(raw);
        if (typeof raw !== "string" || !raw.trim() || !Number.isSafeInteger(number) || number <= 0) result.errors[field] = "Enter a positive safe whole number.";
        else add(flag, String(number), meaning);
      }
    };
    integer("maxRoutes", "--max-routes", "Limit the selected route count.");
    if (a.customizeFormats) {
      if (!reportFormats.some(format => a.formats[format.id] === true)) result.errors.formats = "Select at least one report format, or turn off custom formats to use project settings. This is a builder guard, not a CLI restriction.";
      for (const format of reportFormats) {
        if (typeof a.formats[format.id] !== "boolean") result.errors.formats = "Choose enabled or disabled for each report format.";
        else {
          add(a.formats[format.id] ? `--${format.id}` : `--no-${format.id}`, undefined, `${a.formats[format.id] ? "Enable" : "Disable"} ${format.file}.`);
          if (a.formats[format.id]) result.outputs.push(format.file);
        }
      }
    } else result.outputs.push("CLI defaults: index.html, report.json, report.md, and report.pdf. Existing project configuration may change the enabled formats.");
    if (!["inherit", "on", "off"].includes(a.history)) result.errors.history = "Choose project settings, enabled, or disabled history.";
    if (a.history === "on") add("--history", undefined, "Enable local history snapshots.");
    if (a.history === "off") add("--no-history", undefined, "Disable local history snapshots.");
    if (a.historyLimit !== "" && a.history !== "on") result.errors.historyLimit = "Explicitly enable history before setting its retention limit.";
    integer("historyLimit", "--history-limit", "Retain at most this many local history snapshots (CLI default: 30).");
    if (!["auto", "off", "file"].includes(a.baselineMode)) result.errors.baselineMode = "Choose a supported baseline mode.";
    if (a.baselineMode === "off") add("--no-baseline", undefined, "Disable automatic comparison against the previous report.");
    if (a.baselineMode === "file") add("--baseline", path("baselinePath", a.baselinePath), "Compare with this saved JSON report; relative audit paths resolve against the detected project.");
    if (a.baselineMode !== "file" && a.baselinePath !== "") result.errors.baselinePath = "Clear the baseline path unless explicit-file comparison is selected.";
    result.warnings.push("Configuration is not read in the browser. Unspecified settings inherit project configuration or CLI defaults; files and prerequisites are not checked here.");
    result.warnings.push("Report-only exit status and an overall score do not prove complete coverage. Inspect scanner statuses, scoreEvidence, and report files; PDF generation can fail separately.");
    if (ci && (a.failOn === "none" || a.failOn === "profile" && defaults?.failOn === "none")) result.warnings.push("This CI command does not fail on finding statuses under the chosen policy. A nonzero score threshold or setup/interruption errors can still fail.");
  }
  if (Object.keys(result.errors).length) { result.args = []; result.selections = []; result.outputs = []; return result; }
  result.command = ["qa-check", ...result.args.map(quotePowerShellArgument)].join(" ");
  return result;
}
