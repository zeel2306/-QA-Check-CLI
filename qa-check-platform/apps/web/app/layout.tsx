import type { Metadata } from "next";
import { publicMetadata } from "../components/public-metadata";
import "./globals.css";

export const metadata: Metadata = publicMetadata("QA Check Platform", "Automated Quality Assurance for Development Teams");

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
