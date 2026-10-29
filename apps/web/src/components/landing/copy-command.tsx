"use client";

import { useState } from "react";
import styles from "./landing.module.css";

const command = "npm install -g qa-check-cli";

export function CopyCommand() {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <div>
      <div className={styles.command}>
        <span aria-hidden="true">$</span>
        <code>{command}</code>
        <button type="button" onClick={copyCommand} aria-label="Copy installation command">
          {status === "copied" ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className={styles.copyStatus} role="status">
        {status === "copied" ? "Installation command copied to clipboard." : status === "error" ? "Clipboard unavailable. Select and copy the command above." : "Requires Node.js 22.19+ or Node.js 24."}
      </p>
    </div>
  );
}
