import type { FixDetail } from "./types.js";

export function fixHtmlAccessibilityAndMeta(content: string, filePath: string): { newContent: string; fixes: FixDetail[] } {
  const fixes: FixDetail[] = [];
  let updatedContent = content;

  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();

  // 1. Fix missing alt attributes in img tags
  if ([".html", ".htm", ".jsx", ".tsx", ".vue", ".blade.php", ".php"].includes(ext)) {
    // Match <img ...> tags that do not contain 'alt='
    const imgRegex = /<img\b(?![^>]*\balt=)[^>]*>/gi;
    updatedContent = updatedContent.replace(imgRegex, (match) => {
      // Don't replace if it already has alt
      if (/\balt\s*=/i.test(match)) return match;
      
      const fixedTag = match.replace(/>$/, ' alt="">');
      fixes.push({
        file: filePath,
        rule: "add-missing-alt",
        description: 'Added missing alt="" attribute to <img> tag',
        original: match,
        fixed: fixedTag,
      });
      return fixedTag;
    });
  }

  // 2. Fix missing viewport meta tag in full HTML documents
  if ([".html", ".htm"].includes(ext) && /<head\b/i.test(updatedContent)) {
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(updatedContent)) {
      const metaViewport = '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
      updatedContent = updatedContent.replace(/<head([^>]*)>/i, `<head$1>\n${metaViewport}`);
      fixes.push({
        file: filePath,
        rule: "add-viewport-meta",
        description: "Injected missing viewport meta tag into <head>",
      });
    }

    // 3. Fix missing <title> tag in full HTML documents
    if (!/<title\b/i.test(updatedContent)) {
      const metaTitle = '    <title>Web Application</title>\n';
      updatedContent = updatedContent.replace(/<head([^>]*)>/i, `<head$1>\n${metaTitle}`);
      fixes.push({
        file: filePath,
        rule: "add-title-tag",
        description: "Injected missing <title> tag into <head>",
      });
    }
  }

  return {
    newContent: updatedContent,
    fixes,
  };
}
