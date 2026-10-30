import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { buildCommand, quotePowerShellArgument } from "../src/components/docs/command-builder/generate";
import { commandMetadata, createBuilderState, applyPreset, type BuilderState, type CommandId } from "../src/components/docs/command-builder/metadata";
import { copyText } from "../src/components/docs/clipboard";

// From apps/web: npm.cmd test (PowerShell 7+ enables the native quoting check).
function build(change: (state: BuilderState) => void = () => { }) {
  const state = createBuilderState(); change(state); return buildCommand(state);
}
const canonical: Record<CommandId, string> = {
  audit: "qa-check . --profile report", init: "qa-check init .", fix: "qa-check fix . --dry-run", doctor: "qa-check doctor .",
  compare: "qa-check compare reports/baseline.json reports/report.json", api: "qa-check api .", test: "qa-check test .", flow: "qa-check flow flows/smoke.json",
};
for (const command of commandMetadata) test(`${command.id}: canonical syntax`, () => {
  const result = build(state => { state.command = command.id; });
  assert.equal(result.command, canonical[command.id]); assert.deepEqual(result.errors, {});
});

test("all four presets update command and state together", () => {
  assert.equal(buildCommand(applyPreset("basic")).command, canonical.audit);
  assert.equal(buildCommand(applyPreset("precommit")).command, "qa-check . --profile ci");
  assert.equal(buildCommand(applyPreset("diagnosis")).command, canonical.doctor);
  assert.equal(buildCommand(applyPreset("api")).command, canonical.api);
  const a = applyPreset("basic"), b = applyPreset("basic"); a.audit.formats.html = false;
  assert.equal(b.audit.formats.html, true);
});

test("each project-based command rejects an empty required path", () => {
  for (const command of ["audit", "init", "fix", "doctor", "api", "test"] as CommandId[]) {
    const result = build(state => { state.command = command; state.project = ""; });
    assert.equal(result.command, null); assert.ok(result.errors.project);
  }
});
test("compare requires both reports, and flow requires an explicit target", () => {
  assert.ok(build(state => { state.command = "compare"; state.previousReport = ""; }).errors.previousReport);
  assert.ok(build(state => { state.command = "compare"; state.currentReport = ""; }).errors.currentReport);
  assert.ok(build(state => { state.command = "flow"; state.flowTarget = ""; }).errors.flowTarget);
});
test("audit rejects parser-reserved command words but accepts explicit relative paths", () => {
  for (const word of ["init", "help", "fix", "autofix", "e2e", "flow", "doctor", "compare", "api", "test"]) {
    assert.ok(build(state => { state.project = word; }).errors.project);
    assert.ok(build(state => { state.project = `./${word}`; }).command);
  }
});
test("paths with spaces, apostrophes, Unicode, and backslashes serialize literally", () => {
  assert.equal(build(state => { state.project = "./my app"; }).command, "qa-check './my app' --profile report");
  assert.equal(build(state => { state.project = "./O'Brien app"; }).command, "qa-check './O''Brien app' --profile report");
  assert.ok(build(state => { state.project = "./équipe app"; }).command?.includes("'./équipe app'"));
  assert.ok(build(state => { state.project = ".\\my app"; }).command?.includes("'.\\my app'"));
});
test("path validation blocks shell syntax, controls, and credential-shaped text", () => {
  for (const value of ["--ci", "-h", "$(Write-Output bad)", "./x; echo bad", "./x|echo", "./x&echo", "./x`n", "./x\ny", "./x\r", "./x\0", './a"b', "./*.json", "https://example.test", "password=example", "token:example", "ghp_example", " ./app", "./app "]) {
    const result = build(state => { state.project = value; });
    assert.equal(result.command, null, value); assert.deepEqual(result.args, []); assert.deepEqual(result.selections, []);
  }
});
test("output, compare, baseline, and flow inputs receive the same validation", () => {
  assert.ok(build(state => { state.audit.output = "./out; echo bad"; }).errors.output);
  assert.ok(build(state => { state.command = "compare"; state.currentReport = "--ci"; }).errors.currentReport);
  assert.ok(build(state => { state.audit.baselineMode = "file"; state.audit.baselinePath = "$(bad)"; }).errors.baselinePath);
  assert.ok(build(state => { state.command = "flow"; state.flowTarget = "./flow|bad"; }).errors.flowTarget);
});
test("invalid numeric values are rejected", () => {
  for (const value of ["0", "-1", "1.5", "NaN", "Infinity", " ", "1e30", "1;echo bad"]) {
    assert.ok(build(state => { state.audit.maxRoutes = value; }).errors.maxRoutes, value);
    assert.ok(build(state => { state.audit.history = "on"; state.audit.historyLimit = value; }).errors.historyLimit, value);
  }
  for (const value of ["-1", "101", "Infinity", "NaN", " "]) assert.ok(build(state => { state.audit.ci = true; state.audit.minScore = value; }).errors.minScore, value);
});
test("valid numeric bounds and decimals match parser behavior", () => {
  for (const value of ["0", "100", "80.5"]) assert.ok(build(state => { state.audit.ci = true; state.audit.minScore = value; }).command?.includes(`--min-score ${value}`));
  assert.ok(build(state => { state.audit.maxRoutes = "1e2"; }).command?.includes("--max-routes 100"));
});
test("unsupported commands and enum values never produce commands", () => {
  assert.equal(buildCommand({ ...createBuilderState(), command: "deploy" as CommandId }).command, null);
  for (const profile of ["full", "fast", "constructor", "invalid"]) assert.ok(build(state => { state.audit.profile = profile as never; }).errors.profile);
  assert.ok(build(state => { state.audit.failOn = "fatal" as never; }).errors.failOn);
  assert.ok(build(state => { state.audit.history = "yes" as never; }).errors.history);
  assert.ok(build(state => { state.audit.baselineMode = "yes" as never; }).errors.baselineMode);
});
test("CI-dependent policies are blocked without explicit/profile CI", () => {
  assert.ok(build(state => { state.audit.failOn = "warning"; }).errors.ci);
  assert.ok(build(state => { state.audit.minScore = "80"; }).errors.ci);
  assert.ok(build(state => { state.audit.profile = "strict"; state.audit.minScore = "90"; }).command);
});
test("history limits require explicitly enabled history", () => {
  for (const history of ["inherit", "off"] as const) assert.ok(build(state => { state.audit.history = history; state.audit.historyLimit = "20"; }).errors.historyLimit);
  assert.ok(build(state => { state.audit.history = "on"; state.audit.historyLimit = "20"; }).command?.includes("--history --history-limit 20"));
});
test("baseline modes do not silently override one another", () => {
  assert.ok(build(state => { state.audit.baselineMode = "file"; }).errors.baselinePath);
  assert.ok(build(state => { state.audit.baselineMode = "off"; state.audit.baselinePath = "report.json"; }).errors.baselinePath);
  const result = build(state => { state.audit.baselineMode = "file"; state.audit.baselinePath = "reports/previous scan.json"; });
  assert.ok(result.command?.includes("--baseline 'reports/previous scan.json'")); assert.ok(!result.args.includes("--no-baseline"));
});
test("route lists are deduplicated and emitted once per flag", () => {
  const result = build(state => { state.audit.routes = "/, /about, /"; state.audit.ignoreRoutes = "/private"; });
  assert.ok(result.command?.includes("--route '/,/about' --ignore-route /private"));
  assert.equal(result.args.filter(arg => arg === "--route").length, 1);
});
test("conflicting or unsafe route inputs block generation", () => {
  assert.ok(build(state => { state.audit.routes = "/about"; state.audit.ignoreRoutes = "/about"; }).errors.ignoreRoutes);
  for (const value of ["/,", "//host", "/x?token=example", "/a;echo", "/a%zz", "about", "/a#section", "/api/sk-example"]) assert.ok(build(state => { state.audit.routes = value; }).errors.routes, value);
});
test("custom report flags and the explicit builder format guard", () => {
  const result = build(state => { state.audit.customizeFormats = true; state.audit.formats.pdf = false; });
  assert.ok(result.command?.includes("--html --json --markdown --no-pdf"));
  assert.deepEqual(result.outputs, ["index.html", "report.json", "report.md"]);
  assert.ok(build(state => { state.audit.customizeFormats = true; state.audit.formats = { html: false, json: false, markdown: false, pdf: false }; }).errors.formats);
});
test("no audit flags leak into any subcommand", () => {
  for (const command of commandMetadata.filter(item => item.id !== "audit")) {
    const result = build(state => { state.command = command.id; state.audit.ci = true; state.audit.output = "other"; state.audit.customizeFormats = true; });
    assert.equal(result.command, canonical[command.id]);
  }
});

test("every report-format combination emits explicit supported flags", () => {
  const formats = ["html", "json", "markdown", "pdf"] as const;
  for (let mask = 0; mask < 16; mask++) {
    const result = build(state => {
      state.audit.customizeFormats = true;
      formats.forEach((format, index) => { state.audit.formats[format] = Boolean(mask & (1 << index)); });
    });
    if (!mask) { assert.equal(result.command, null); assert.ok(result.errors.formats); continue; }
    assert.ok(result.command);
    formats.forEach((format, index) => {
      const enabled = Boolean(mask & (1 << index));
      assert.ok(result.args.includes(enabled ? `--${format}` : `--no-${format}`));
      assert.ok(!result.args.includes(enabled ? `--no-${format}` : `--${format}`));
    });
  }
});

test("all supported CI policies and profiles preserve explicit gate overrides", () => {
  for (const profile of ["report", "ci", "strict"] as const) {
    for (const failOn of ["error", "warning", "none"] as const) {
      const result = build(state => { Object.assign(state.audit, { profile, ci: true, failOn, minScore: "87.5" }); });
      assert.ok(result.command, JSON.stringify(result.errors));
      assert.equal(result.args[result.args.indexOf("--profile") + 1], profile);
      assert.equal(result.args[result.args.indexOf("--fail-on") + 1], failOn);
      assert.equal(result.args[result.args.indexOf("--min-score") + 1], "87.5");
    }
  }
});

test("history and baseline modes emit only the selected behavior", () => {
  for (const history of ["inherit", "on", "off"] as const) {
    for (const baselineMode of ["auto", "off", "file"] as const) {
      const result = build(state => {
        Object.assign(state.audit, { history, baselineMode, historyLimit: history === "on" ? "15" : "", baselinePath: baselineMode === "file" ? "previous scan.json" : "" });
      });
      assert.ok(result.command, JSON.stringify(result.errors));
      assert.equal(result.args.includes("--history"), history === "on");
      assert.equal(result.args.includes("--no-history"), history === "off");
      assert.equal(result.args.includes("--history-limit"), history === "on");
      assert.equal(result.args.includes("--baseline"), baselineMode === "file");
      assert.equal(result.args.includes("--no-baseline"), baselineMode === "off");
    }
  }
});
test("live fix mode has an explicit source-write warning", () => {
  const result = build(state => { state.command = "fix"; state.dryRun = false; });
  assert.equal(result.command, "qa-check fix ."); assert.ok(result.warnings.some(value => value.includes("writes source fixes")));
});
test("all emitted flags are implemented parser cases; no duplicate or empty args", () => {
  const parser = fs.readFileSync(new URL("../../../src/index.ts", import.meta.url), "utf8");
  const supported = new Set([...parser.matchAll(/case "(--[\w-]+)":/g)].map(match => match[1])); supported.add("--dry-run");
  const result = build(state => { Object.assign(state.audit, { profile: "strict", ci: true, failOn: "error", minScore: "85", output: "audit reports", routes: "/,/about", ignoreRoutes: "/admin", maxRoutes: "10", customizeFormats: true, history: "on", historyLimit: "20", baselineMode: "file", baselinePath: "previous.json" }); });
  assert.ok(result.command, JSON.stringify(result.errors));
  const flags = result.args.filter(arg => arg.startsWith("--"));
  assert.equal(new Set(flags).size, flags.length); flags.forEach(flag => assert.ok(supported.has(flag), flag));
  assert.ok(result.args.every(arg => typeof arg === "string" && arg.length > 0));
  for (const item of commandMetadata.filter(item => item.id !== "audit")) assert.ok(parser.includes(`args[0] === "${item.id}"`));
});
test("PowerShell 7+ literal arguments round-trip without interpolation", t => {
  const shell = process.env.PWSH_EXECUTABLE ?? "pwsh";
  const values = ["./my app", "./O'Brien app", ".\\my app", "./équipe app", "$(Write-Output INJECTED)", "x'; Write-Output INJECTED; '"];
  const script = `& ${quotePowerShellArgument(process.execPath)} -e ${quotePowerShellArgument("console.log(JSON.stringify(process.argv.slice(1)))")} ${values.map(quotePowerShellArgument).join(" ")}`;
  const execution = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (execution.error && (execution.error as NodeJS.ErrnoException).code === "ENOENT") { t.skip("PowerShell executable unavailable"); return; }
  assert.equal(execution.status, 0, execution.stderr); assert.deepEqual(JSON.parse(execution.stdout.trim()), values);
});
test("clipboard success receives exactly the displayed command", async () => {
  const text = build().command!; let captured = "";
  const result = await copyText(text, async value => { captured = value; });
  assert.equal(captured, text); assert.deepEqual(result, { status: "copied" });
});
test("clipboard rejection and synchronous API failure return error", async () => {
  assert.deepEqual(await copyText("qa-check .", async () => { throw new Error("Permission denied"); }), { status: "error" });
  assert.deepEqual(await copyText("qa-check .", () => { throw new Error("Unavailable API"); }), { status: "error" });
  let called = false; assert.deepEqual(await copyText("", async () => { called = true; }), { status: "error" }); assert.equal(called, false);
});
test("clipboard success is not reported while a write is pending", async () => {
  let resolve!: () => void; let settled = false;
  const work = copyText("qa-check .", () => new Promise<void>(done => { resolve = done; })).then(result => { settled = true; return result; });
  await Promise.resolve(); assert.equal(settled, false); resolve(); assert.deepEqual(await work, { status: "copied" });
});
