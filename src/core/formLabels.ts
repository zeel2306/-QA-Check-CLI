import type { Page } from "playwright";
import type { BrowserIssue } from "../types/result.js";

/** Optional product policy, distinct from axe accessible-name/WCAG results. */
export async function inspectFormLabels(page: Page, route: string, policy?: "associated" | "visible"): Promise<BrowserIssue[]> {
  if (!policy) return [];
  return page.evaluate(({ route, policy }) => {
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        if (Number(getComputedStyle(ancestor).opacity) === 0) return false;
      }
      return !element.closest('[hidden],[aria-hidden="true"],[inert]') && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
    };
    const selectorFor = (control: Element): string => {
      const candidate = control.id ? `#${CSS.escape(control.id)}` : `${control.tagName.toLowerCase()}:nth-of-type(${[...control.parentElement!.children].filter(sibling => sibling.tagName === control.tagName).indexOf(control) + 1})`;
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      const parts: string[] = [];
      for (let element: Element | null = control; element; element = element.parentElement) {
        parts.unshift(`${element.tagName.toLowerCase()}${element.parentElement ? `:nth-child(${[...element.parentElement.children].indexOf(element) + 1})` : ""}`);
      }
      return parts.join(" > ");
    };
    const issues: BrowserIssue[] = [];
    for (const [index, control] of [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].entries()) {
      if (!visible(control) || (control instanceof HTMLInputElement && ["hidden", "button", "submit", "reset", "image"].includes(control.type))) continue;
      const labels: Element[] = [...(control.labels || [])];
      const references = (control.getAttribute("aria-labelledby") || "").trim().split(/\s+/).filter(Boolean);
      // A dangling reference does not establish a complete association.
      if (references.length && references.every(id => document.getElementById(id))) labels.push(...references.map(id => document.getElementById(id)!));
      const hasLabel = labels.some(label => (policy === "visible" ? (label as HTMLElement).innerText : label.textContent)?.trim() && (policy !== "visible" || visible(label)));
      if (!hasLabel) issues.push({ route, type: `form-label-policy-${policy}`, selector: selectorFor(control), message: `Optional form-label policy: control ${index + 1} has no ${policy === "visible" ? "visible associated" : "associated"} text label. This is separate from axe accessible-name rules; placeholders and aria-label may still provide an accessible name.` });
    }
    return issues;
  }, { route, policy });
}
