import type { FixDetail } from "./types.js";

export function fixDebugStatements(content: string, filePath: string): { newContent: string; fixes: FixDetail[] } {
  const lines = content.split(/\r?\n/);
  const fixes: FixDetail[] = [];
  const updatedLines: string[] = [];

  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Skip already commented out lines
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
      updatedLines.push(line);
      return;
    }

    let modifiedLine = line;
    let isFixed = false;

    if ([".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte"].includes(ext)) {
      // Single line console.log/debug/dir removal or comment out
      if (/^\s*console\.(log|debug|dir|warn)\s*\(.*?\);?\s*$/.test(line)) {
        fixes.push({
          file: filePath,
          line: index + 1,
          rule: "remove-debug-statement",
          description: "Removed debug statement console.log/debug",
          original: trimmed,
        });
        isFixed = true;
      }
    } else if (ext === ".php") {
      if (/^\s*(var_dump|print_r|dd|dump)\s*\(.*?\);?\s*$/.test(line)) {
        fixes.push({
          file: filePath,
          line: index + 1,
          rule: "remove-debug-statement",
          description: "Removed PHP debug function var_dump/dd/print_r",
          original: trimmed,
        });
        isFixed = true;
      }
    } else if (ext === ".dart") {
      if (/^\s*(debugPrint|print)\s*\(.*?\);?\s*$/.test(line)) {
        fixes.push({
          file: filePath,
          line: index + 1,
          rule: "remove-debug-statement",
          description: "Removed Dart debugPrint/print statement",
          original: trimmed,
        });
        isFixed = true;
      }
    }

    if (!isFixed) {
      updatedLines.push(modifiedLine);
    }
  });

  return {
    newContent: updatedLines.join("\n"),
    fixes,
  };
}
