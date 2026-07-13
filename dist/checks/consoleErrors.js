import { BrowserCheck, issueStatus } from "./base.js";
export class ConsoleErrorsCheck extends BrowserCheck {
    name = "Console Errors";
    async evaluate(audit) { return { status: issueStatus(audit.console.length), message: `${audit.console.length} errors`, data: audit.console }; }
}
