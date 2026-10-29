"use client";

import { useState } from "react";
import Link from "next/link";
import { CodeBlock } from "../code-block";
import { commandMetadata,createBuilderState,profileDefaults,reportFormats,presets,applyPreset,type AuditOptions,type BuilderState,type CommandId,type Profile,type SwitchMode,type BaselineMode } from "./metadata";
import { buildCommand } from "./generate";
import styles from "./builder.module.css";

function Field({ name,label,value,onChange,hint,error,type="text",disabled=false }: { name: string; label: string; value: string; onChange: (value: string) => void; hint: string; error?: string; type?: "text"|"number"; disabled?: boolean }) {
  return <div className={styles.field}>
    <label htmlFor={`builder-${name}`}>{label}</label>
    <input id={`builder-${name}`} type={type} step={type==="number"? "any":undefined} value={value} disabled={disabled} autoComplete="off" spellCheck={false} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`builder-${name}-hint${error? ` builder-${name}-error`:""}`} />
    <small id={`builder-${name}-hint`}>{hint}</small>
    {error&&<p id={`builder-${name}-error`} className={styles.error}>{error}</p>}
  </div>;
}

export function CommandBuilder() {
  const [state,setState]=useState<BuilderState>(createBuilderState);
  const result=buildCommand(state);
  const meta=commandMetadata.find(item => item.id===state.command)!;
  const defaults=profileDefaults[state.audit.profile];
  const ciEnabled=defaults.ci||state.audit.ci;
  const update=<K extends keyof BuilderState>(key: K,value: BuilderState[K]) => setState(previous => ({ ...previous,[key]: value }));
  function updateAudit(patch: Partial<AuditOptions>) {
    setState(previous => {
      const audit={ ...previous.audit,...patch };
      if (!profileDefaults[audit.profile].ci&&!audit.ci) { audit.failOn="profile"; audit.minScore=""; }
      if (audit.history!=="on") audit.historyLimit="";
      if (audit.baselineMode!=="file") audit.baselinePath="";
      return { ...previous,audit };
    });
  }
  const auditField=(name: "output"|"routes"|"ignoreRoutes"|"maxRoutes"|"minScore"|"historyLimit"|"baselinePath",label: string,hint: string,numeric=false,disabled=false) => <Field key={name} name={name} label={label} value={state.audit[name]} onChange={value => updateAudit({ [name]: value })} hint={hint} error={result.errors[name]} type={numeric? "number":"text"} disabled={disabled} />;

  return <div className={styles.builder}>
    <div className={styles.notice}>
      <strong>Build here. Run in your own terminal.</strong>
      <p>PowerShell 7+ output only. Nothing is executed, uploaded, or saved by this tool. Use filesystem paths—not credentials, URLs, shell variables, or operators.</p>
    </div>
    <div className={styles.presets} aria-label="Quick presets">{presets.map(preset => <button key={preset.id} type="button" onClick={() => setState(applyPreset(preset.id))}>
      <strong>{preset.name}<span aria-hidden="true">↗</span>
      </strong>
      <small>{preset.description}</small>
    </button>)}</div>
    <div className={styles.workspace}>
      <form className={styles.form} onSubmit={event => event.preventDefault()} aria-label="CLI command builder">
        <div className={styles.field}>
          <label htmlFor="builder-command">Command</label>
          <select id="builder-command" value={state.command} onChange={event => update("command",event.target.value as CommandId)}>{commandMetadata.map(command => <option key={command.id} value={command.id}>{command.name}</option>)}</select>
        </div>
        <div className={styles.commandInfo}>
          <strong>{meta.description}</strong>
          <p>
            <b>Typical use:</b> {meta.useCase}</p>
          <p>
            <b>Setup:</b> {meta.configuration}</p>
        </div>
        {state.command==="compare"? <div className={styles.grid}>
          <Field name="previousReport" label="Previous JSON report" value={state.previousReport} onChange={value => update("previousReport",value)} hint="Required. Relative to your terminal's current directory." error={result.errors.previousReport} />
          <Field name="currentReport" label="Current JSON report" value={state.currentReport} onChange={value => update("currentReport",value)} hint="Required. The newer saved report to compare." error={result.errors.currentReport} />
        </div>:state.command==="flow"? <Field name="flowTarget" label="Flow file or directory" value={state.flowTarget} onChange={value => update("flowTarget",value)} hint="Required by this builder. Run from the intended project directory. JSON is preferred." error={result.errors.flowTarget} />:<Field name="project" label="Project path" value={state.project} onChange={value => update("project",value)} hint="Use . for the current project or a literal path such as ./my app. Existing files are not inspected here." error={result.errors.project} />}
        {state.command==="fix"&&<label className={styles.checkbox}>
          <input type="checkbox" checked={state.dryRun} onChange={event => update("dryRun",event.target.checked)} />
          <span>
            <strong>Preview changes only (--dry-run)</strong>
            <small>Enabled by default. Clearing this generates a command that writes supported source fixes.</small>
          </span>
        </label>}
        {state.command==="audit"&&<>
          <fieldset>
            <legend>Audit behavior</legend>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="builder-profile">Profile</label>
                <select id="builder-profile" value={state.audit.profile} onChange={event => updateAudit({ profile: event.target.value as Profile })}>
                  <option value="report">Report — findings without gate failure</option>
                  <option value="ci">CI — fail on failing checks</option>
                  <option value="strict">Strict — warnings and score below 80</option>
                </select>
                <small>Explicitly selects a verified profile. Other settings can still come from project configuration.</small>
              </div>
              {auditField("output","Output directory","Optional. CLI default: reports/ under the detected project; config can override it.")}
            </div>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={ciEnabled} disabled={defaults.ci} onChange={event => updateAudit({ ci: event.target.checked })} />
              <span>
                <strong>Return CI exit codes</strong>
                <small>{defaults.ci? "Enabled by this profile.":"Required for the exit-policy overrides below. Existing config can also enable CI."}</small>
              </span>
            </label>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="builder-failOn">Failure policy override</label>
                <select id="builder-failOn" disabled={!ciEnabled} value={state.audit.failOn} onChange={event => updateAudit({ failOn: event.target.value as AuditOptions["failOn"] })}>
                  <option value="profile">Profile default ({defaults.failOn})</option>
                  <option value="error">Error — failing/execution-problem checks</option>
                  <option value="warning">Warning — include warnings</option>
                  <option value="none">None — do not fail on statuses</option>
                </select>
                <small>Available with CI exit codes. The numeric threshold is evaluated separately.</small>
              </div>
              {auditField("minScore","Minimum score override",`Optional 0–100. Profile default: ${defaults.minScore}. Requires CI exit codes.`,true,!ciEnabled)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Route selection</legend>
            <div className={styles.grid}>
              {auditField("routes","Include routes","Optional, comma-separated literal paths: /, /about. No queries or wildcards.")}
              {auditField("ignoreRoutes","Ignore routes","Optional exclusions. The same literal route cannot be both included and ignored.")}
              {auditField("maxRoutes","Maximum routes","Optional positive safe whole number. Project configuration may set its own limit.",true)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Report formats</legend>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={state.audit.customizeFormats} onChange={event => updateAudit({ customizeFormats: event.target.checked })} />
              <span>
                <strong>Override project report formats</strong>
                <small>Otherwise inherit project settings; CLI defaults enable all four formats.</small>
              </span>
            </label>
            {state.audit.customizeFormats&&<div className={styles.formats}>{reportFormats.map(format => <label key={format.id} className={styles.checkbox}>
              <input type="checkbox" checked={state.audit.formats[format.id]} onChange={event => updateAudit({ formats: { ...state.audit.formats,[format.id]: event.target.checked } })} />
              <span>{format.label}</span>
            </label>)}</div>}
            {result.errors.formats&&<p className={styles.error}>{result.errors.formats}</p>}
          </fieldset>
          <details className={styles.moreOptions}>
            <summary>History & baseline options</summary>
            <div>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="builder-history">Local history</label>
                  <select id="builder-history" value={state.audit.history} onChange={event => updateAudit({ history: event.target.value as SwitchMode })}>
                    <option value="inherit">Use project settings (CLI default: enabled)</option>
                    <option value="on">Explicitly enable history</option>
                    <option value="off">Disable history</option>
                  </select>
                </div>{auditField("historyLimit","History retention limit","Optional positive safe integer; CLI default 30. Explicitly enable history to override.",true,state.audit.history!=="on")}</div>
              <div className={styles.field}>
                <label htmlFor="builder-baselineMode">Baseline comparison</label>
                <select id="builder-baselineMode" value={state.audit.baselineMode} onChange={event => updateAudit({ baselineMode: event.target.value as BaselineMode })}>
                  <option value="auto">Use project/default baseline behavior</option>
                  <option value="off">Disable automatic baseline comparison</option>
                  <option value="file">Compare with an explicit JSON report</option>
                </select>
                <small>Automatic mode can use the prior report. Explicit file and disabled modes are mutually exclusive here.</small>
              </div>
              {state.audit.baselineMode==="file"&&auditField("baselinePath","Baseline JSON report","Required for explicit comparison. Relative paths resolve against the detected project.")}
            </div>
          </details>
        </>}
      </form>
      <div className={styles.preview} aria-label="Live command preview">
        <div className={styles.previewHeading}>
          <h3>Your command</h3>
          <span>{result.command? "Ready to copy":"Needs attention"}</span>
        </div>
        {result.command? <CodeBlock key={result.command} code={result.command} label="PowerShell 7+ · your terminal" copyLabel="Copy command" />:<div className={styles.invalidPreview} role="alert">
          <strong>Resolve the highlighted fields to generate a command.</strong>
          <ul>{Object.entries(result.errors).map(([field,message]) => <li key={field}>{message}</li>)}</ul>
          <button type="button" disabled>Copy command</button>
        </div>}
        <p className={styles.shellNote}>Only PowerShell 7+ is supported. Paths with spaces or apostrophes are quoted as literal arguments. Bash, cmd.exe, interpolation, globbing, and shell expressions are outside this builder's scope.</p>
      </div>
    </div>
    <section className={styles.explanation} aria-label="Command explanation">
      <h3>What happens in your terminal</h3>
      <p>{result.explanation}</p>
      {result.command&&<>
        <h4>Expected outputs</h4>
        <ul>{result.outputs.map(output => <li key={output}>{output}</li>)}</ul>{result.selections.length>0&&<details>
          <summary>Explain selected options ({result.selections.length})</summary>
          <dl>{result.selections.map(selection => <div key={selection.option}>
            <dt>
              <code>{selection.option}</code>
            </dt>
            <dd>{selection.meaning}</dd>
          </div>)}</dl>
        </details>}</>}
      <div className={styles.warnings}>{result.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>
      <p>
        <Link href="/docs/commands">CLI command reference →</Link>
        <Link href="/docs/troubleshooting">Troubleshooting →</Link>
      </p>
    </section>
  </div>;
}
