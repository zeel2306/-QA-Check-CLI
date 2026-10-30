import { DocArticle } from "@/components/docs/doc-article";
import { documentation } from "@/components/docs/content";

export default function DocumentationHome() {
  return <DocArticle page={documentation[0]} />;
}
