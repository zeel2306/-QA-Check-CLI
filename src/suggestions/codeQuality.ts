import type { SuggestionMap } from "./types.js";

export const codeQualitySuggestions: SuggestionMap = {
  "large-file": {
    code: "large-file",
    title: "Large File",
    problem: "One source file is doing too much work.",
    whyItMatters: "Large files are harder to review, test, reuse, and safely change.",
    suggestedFix: [
      "Split the file into smaller modules, screens, widgets, hooks, utilities, or services.",
      "Keep one clear responsibility per file where practical.",
      "Move repeated UI or business logic into reusable components or helpers.",
    ],
    shortFix: "Split the file into smaller focused modules or components.",
  },
  "repeated-code": {
    code: "repeated-code",
    title: "Repeated Code",
    problem: "Similar code appears in multiple files.",
    whyItMatters: "Repeated code makes bugs easier to copy and fixes harder to apply everywhere.",
    suggestedFix: [
      "Extract the repeated logic into a shared helper, hook, widget, component, or service.",
      "Create reusable UI components for repeated layouts.",
      "Keep shared behavior in one place and cover it with focused tests.",
    ],
    shortFix: "Extract repeated logic into a reusable helper or component.",
  },
  "debug-statement": {
    code: "debug-statement",
    title: "Debug Statement",
    problem: "Debug logging is still present in source code.",
    whyItMatters: "Debug output can expose internal data and creates noisy production logs.",
    suggestedFix: [
      "Remove temporary console.log, print, or debugPrint calls before release.",
      "Use a proper logger with environment-based log levels when logging is required.",
    ],
    shortFix: "Remove temporary debug logging or use a controlled logger.",
  },
  "todo-marker": {
    code: "todo-marker",
    title: "TODO Marker",
    problem: "The code contains a TODO, FIXME, or HACK marker.",
    whyItMatters: "Untracked follow-up work can become hidden technical debt.",
    suggestedFix: [
      "Resolve the note before release or move it into your issue tracker.",
      "Add a clear owner, reason, and follow-up date if the marker must stay.",
    ],
    shortFix: "Resolve the marker or track it as a real issue.",
  },
  "long-build-method": {
    code: "long-build-method",
    title: "Long Flutter Build Method",
    problem: "A Flutter build method is too large.",
    whyItMatters: "Large build methods are hard to reason about and often lead to duplicated UI.",
    suggestedFix: [
      "Extract sections into small StatelessWidget or StatefulWidget classes.",
      "Move formatting and mapping logic outside the build method.",
      "Keep the build method focused on composing already-named widgets.",
    ],
    shortFix: "Extract smaller Flutter widgets from the large build method.",
  },
};
