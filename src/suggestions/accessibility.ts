import type { SuggestionMap } from "./types.js";

export const accessibilitySuggestions: SuggestionMap = {
  "button-name": {
    code: "button-name",
    title: "Button Missing Accessible Name",
    problem: "A button does not expose an accessible name.",
    whyItMatters: "Screen reader users need a label to understand the button action.",
    suggestedFix: ['<button aria-label="Close">...</button>'],
    shortFix: "Add visible text or an aria-label to the button.",
  },
  "image-alt": {
    code: "image-alt",
    title: "Image Missing Alt Text",
    problem: "An image does not provide alternative text.",
    whyItMatters: "Assistive technology cannot describe meaningful images without alt text.",
    suggestedFix: ['<img src="..." alt="Meaningful description" />'],
    shortFix: "Add meaningful alt text.",
  },
  "color-contrast": {
    code: "color-contrast",
    title: "Insufficient Color Contrast",
    problem: "Text contrast is below accessibility guidelines.",
    whyItMatters: "Low contrast makes content hard to read for users with low vision.",
    suggestedFix: ["Increase foreground/background contrast to meet WCAG AA."],
    shortFix: "Increase text contrast.",
  },
  label: {
    code: "label",
    title: "Form Control Missing Label",
    problem: "A form control does not have an accessible label.",
    whyItMatters: "Users need labels to understand what information to enter.",
    suggestedFix: ['<label for="email">Email</label><input id="email" />'],
    shortFix: "Associate every input with a label.",
  },
  "link-name": {
    code: "link-name",
    title: "Link Missing Accessible Name",
    problem: "A link does not expose readable text or an accessible label.",
    whyItMatters: "Screen reader users need clear link purpose.",
    suggestedFix: ['<a href="/pricing">View pricing</a>'],
    shortFix: "Add descriptive link text.",
  },
};
