import { BrowserCheck, issueStatus } from "./base.js";
export class ConsoleErrorsCheck extends BrowserCheck { readonly name = "Console Errors"; protected async evaluate(audit: Awaited<ReturnType<typeof this.audit>>) { return { status: issueStatus(audit.console.length), message: `${audit.console.length} errors`, data: audit.console }; } }
