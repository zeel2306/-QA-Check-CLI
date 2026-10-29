import type { ReactNode } from "react";

export interface DocumentationPage {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  sections: { id: string; title: string; body: ReactNode }[];
}
export interface TroubleshootingTopic {
  id: string;
  title: string;
  kind: "Environment" | "CLI configuration" | "Project" | "Scan evidence" | "Report output";
  symptoms: string;
  causes: string;
  steps: string[];
  command?: string;
  confirm: string;
  related: string;
  source: string;
}
export interface FaqCategory {
  id: string;
  title: string;
  questions: { id: string; question: string; answer: string; related: string }[];
}
export interface ErrorGroup {
  id: string;
  title: string;
  entries: { id: string; message: string; meaning: string; causes: string; solution: string; related: string; source: string }[];
}
