export const commandMetadata = [
  { id: "audit", name: "Audit", description: "Run the detected project's quality pipeline.", useCase: "Review code and browser quality before a release.", configuration: "Optional project configuration; dependencies and browsers must be ready.", effect: "Detects the framework, runs applicable checks, and writes enabled reports. It may start project scripts and request application routes." },
  { id: "init", name: "Init", description: "Create missing starter configuration files.", useCase: "Set up a project's first QA Check configuration.", configuration: "No existing QA config required.", effect: "Creates missing qa-check.config.json and .github/workflows/qa-check.yml; existing files are skipped. Review the generated workflow and sample external API case before use." },
  { id: "fix", name: "Fix / Autofix", description: "Preview or apply the implemented source fixes.", useCase: "Review debug-statement and HTML accessibility/meta fixes.", configuration: "Source files in the selected project; no special configuration required.", effect: "Runs the implemented debug-statement and HTML accessibility/meta fixers. The builder uses fix, the canonical form of autofix." },
  { id: "doctor", name: "Doctor", description: "Diagnose local tools and project readiness.", useCase: "Investigate environment or setup problems.", configuration: "No special configuration required.", effect: "Checks environment and project setup. Doctor creates reports/ if needed and writes then removes a permission probe; a browser-package check is not a browser launch test." },
  { id: "compare", name: "Compare", description: "Compare two saved JSON audit reports.", useCase: "Review regressions between comparable scans.", configuration: "Two existing JSON reports with compatible scope and versions.", effect: "Compares the previous and current report, prints trends and the regression gate, and returns a gate exit code. The builder requires both reports; the CLI's one-file summary form is not generated." },
  { id: "api", name: "API", description: "Run configured HTTP endpoint tests.", useCase: "Check service responses against an intended contract.", configuration: "Requires api cases in the project's supported configuration.", effect: "Runs configured API cases and prints endpoint results. No cases means no tests. It is not a platform report upload command." },
  { id: "test", name: "Test / E2E", description: "Run configured browser user flows.", useCase: "Exercise a project's existing smoke-test flows.", configuration: "Requires flows configuration, Playwright Chromium, and runtime readiness.", effect: "Loads configured flows and runs them in the project's runtime. No flows means no tests. The builder uses test, the canonical form of e2e." },
  { id: "flow", name: "Flow", description: "Run a JSON/YAML flow file or directory.", useCase: "Run a specific saved smoke flow from the project directory.", configuration: "Requires an existing flow target and browser/runtime setup.", effect: "Loads flows from the target, falling back to current-directory configuration if none are found. Runtime context is the current working directory. JSON is preferred over the limited YAML parser." },
] as const;

export type CommandId = typeof commandMetadata[number]["id"];
export const profileDefaults = {
  report: { ci: false, failOn: "none", minScore: 0 },
  ci: { ci: true, failOn: "error", minScore: 0 },
  strict: { ci: true, failOn: "warning", minScore: 80 },
} as const;
export type Profile = keyof typeof profileDefaults;
export type SwitchMode = "inherit" | "on" | "off";
export type BaselineMode = "auto" | "off" | "file";
export const reportFormats = [
  { id: "html", file: "index.html", label: "HTML" },
  { id: "json", file: "report.json", label: "JSON" },
  { id: "markdown", file: "report.md", label: "Markdown" },
  { id: "pdf", file: "report.pdf", label: "PDF" },
] as const;
export type Format = typeof reportFormats[number]["id"];

export interface AuditOptions {
  profile: Profile;
  ci: boolean;
  failOn: "profile" | "none" | "error" | "warning";
  minScore: string;
  output: string;
  routes: string;
  ignoreRoutes: string;
  maxRoutes: string;
  customizeFormats: boolean;
  formats: Record<Format, boolean>;
  history: SwitchMode;
  historyLimit: string;
  baselineMode: BaselineMode;
  baselinePath: string;
}
export interface BuilderState {
  command: CommandId;
  project: string;
  dryRun: boolean;
  previousReport: string;
  currentReport: string;
  flowTarget: string;
  audit: AuditOptions;
}
export function createBuilderState(): BuilderState {
  return {
    command: "audit", project: ".", dryRun: true,
    previousReport: "reports/baseline.json", currentReport: "reports/report.json", flowTarget: "flows/smoke.json",
    audit: { profile: "report", ci: false, failOn: "profile", minScore: "", output: "", routes: "", ignoreRoutes: "", maxRoutes: "", customizeFormats: false, formats: { html: true, json: true, markdown: true, pdf: true }, history: "inherit", historyLimit: "", baselineMode: "auto", baselinePath: "" },
  };
}
export const presets = [
  { id: "basic", name: "Basic audit", description: "Report-only audit using project/default output settings." },
  { id: "precommit", name: "Pre-commit quality check", description: "CI exit codes for findings; does not install a Git hook or push code." },
  { id: "diagnosis", name: "Environment diagnosis", description: "Check local tools, project setup, and report permissions." },
  { id: "api", name: "API testing", description: "Run existing configured endpoint cases." },
] as const;
export type PresetId = typeof presets[number]["id"];
export function applyPreset(id: PresetId): BuilderState {
  const state = createBuilderState();
  if (id === "precommit") state.audit.profile = "ci";
  if (id === "diagnosis") state.command = "doctor";
  if (id === "api") state.command = "api";
  return state;
}
