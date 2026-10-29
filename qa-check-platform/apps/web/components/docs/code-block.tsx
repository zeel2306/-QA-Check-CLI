"use client";

import { useState } from "react";
import { copyText } from "./clipboard";
import styles from "./docs.module.css";

export function CodeBlock({ code, label = "Terminal", copyLabel }: { code: string; label?: string; copyLabel?: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  async function copy() {
    setStatus("copying");
    const result = await copyText(code, value => navigator.clipboard.writeText(value));
    setStatus(result.status);
  }
  return <div className={styles.codeBlock}>
    <div className={styles.codeHeader}>
      <span>{label}</span>
      <button type="button" onClick={copy} disabled={status === "copying"} aria-label={copyLabel ?? `Copy ${label} code`}>{status === "copied" ? "Copied ✓" : status === "copying" ? "Copying…" : copyLabel ?? "Copy"}</button>
    </div>
    <pre tabIndex={0} aria-label={label}>
      <code>{code}</code>
    </pre>
    <p className={styles.copyStatus} role="status">{status === "copied" ? "Code copied to clipboard." : status === "error" ? "Clipboard unavailable. Select and copy the code manually." : status === "copying" ? "Writing to clipboard…" : "Select the code or use Copy."}</p>
  </div>;
}
