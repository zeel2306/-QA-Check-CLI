import type { Metadata } from "next";

// Text-only social cards work locally without inventing a production origin or image.
export function publicMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { title, description, siteName: "QA Check Platform", type: "website" },
    twitter: { card: "summary", title, description },
  };
}
