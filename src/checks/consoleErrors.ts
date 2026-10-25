import { BrowserCheck } from "./base.js";

export class ConsoleErrorsCheck extends BrowserCheck {
  readonly name = "Console Errors";

  protected async evaluate(audit: Awaited<ReturnType<typeof this.audit>>) {
    if (!audit || !audit.console) {
      return {
        status: "NOT_APPLICABLE" as const,
        score: null,
        message: "No console logs captured",
        skipReason: "No browser audit data",
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const pagesAttempted = audit.seo?.length || 0;
    const pagesCompleted = audit.seo?.length || 0;

    if (pagesCompleted === 0) {
      return {
        status: "NOT_APPLICABLE" as const,
        score: null,
        message: "No pages audited for console errors",
        skipReason: "No pages audited",
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const errors = audit.console;
    const status = errors.length === 0 ? ("PASS" as const) : ("FAIL" as const);
    const score = errors.length === 0 ? 100 : Math.max(0, 100 - errors.length * 20);
    const message = errors.length === 0 ? "0 console errors detected" : `${errors.length} console error(s) detected`;

    return {
      status,
      score,
      message,
      pagesAttempted,
      pagesCompleted,
      data: {
        totalErrors: errors.length,
        errors,
      },
    };
  }
}
