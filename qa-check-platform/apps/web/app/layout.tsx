import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QA Check Platform",
  description: "Automated Quality Assurance for Development Teams",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
