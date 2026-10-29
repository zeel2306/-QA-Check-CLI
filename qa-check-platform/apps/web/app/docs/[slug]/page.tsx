import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "../../../components/docs/doc-article";
import { documentation } from "../../../components/docs/content";
import { publicMetadata } from "../../../components/public-metadata";

export const dynamicParams = false;
export function generateStaticParams() {
  return documentation.filter(page => page.slug).map(page => ({ slug: page.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = documentation.find(item => item.slug === slug);
  return page ? publicMetadata(page.title, page.description) : {};
}
export default async function Guide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = documentation.find(item => item.slug === slug);
  if(!page) notFound();
  return <DocArticle page={page} />;
}
