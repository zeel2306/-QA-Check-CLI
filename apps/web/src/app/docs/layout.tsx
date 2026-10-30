import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";
import { publicMetadata } from "@/components/public-metadata";

export const metadata: Metadata = {
  ...publicMetadata("Documentation | QA Check", "Source-verified guides for QA Check CLI and the QA Check Platform foundation."),
  title: { default: "Documentation | QA Check", template: "%s | QA Check Docs" },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
