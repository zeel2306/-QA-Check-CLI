/** Normalize concrete URLs without treating query strings or fragments as path segments. */
export function normalizeRoutePath(route: string): string {
  const pathname = route.trim().replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
  return `/${pathname.replaceAll("\\", "/").split("/").filter(Boolean).join("/")}`;
}

/** Preserve parameter modifiers while removing file-router groups and parallel slots. Preserves HTTP method prefix if present. */
export function normalizeDeclaredRoute(route: string): string {
  let methodPrefix = "";
  let cleanRoute = route.trim();
  const methodMatch = cleanRoute.match(/^([A-Z]+)\s+(.*)$/);
  if (methodMatch) {
    methodPrefix = `${methodMatch[1]} `;
    cleanRoute = methodMatch[2]!;
  }
  const segments = cleanRoute.split("/")
    // Backslashes inside a colon parameter are regex escapes, not filesystem separators.
    .flatMap((segment) => segment.startsWith(":") ? [segment] : segment.split("\\"))
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .filter((segment) => !segment.startsWith("@"));
  return `${methodPrefix}/${segments.join("/")}`;
}

/** Only declarations establish validity; a RouterLink destination is not a declaration. */
export function extractDeclaredRoutes(source: string): string[] {
  const routes: string[] = [];
  for (const match of source.matchAll(/(?:<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']|\bpath\s*:\s*["']([^"']*)["'])/g)) {
    routes.push(normalizeDeclaredRoute(match[1] ?? match[2] ?? "/"));
  }
  return routes;
}

/** Full-path matching for colon parameters and file-router bracket/catch-all syntax. */
export function matchesDeclaredRoute(url: string, declaration: string): boolean {
  const cleanDeclaration = declaration.replace(/^[A-Z]+\s+/, "");
  const actual = normalizeRoutePath(url).split("/").filter(Boolean);
  const pattern = normalizeDeclaredRoute(cleanDeclaration).split("/").filter(Boolean);
  const visit = (patternIndex: number, actualIndex: number): boolean => {
    if (patternIndex === pattern.length) return actualIndex === actual.length;
    const segment = pattern[patternIndex];
    let minimum = 1;
    let maximum = 1;
    let constraint: RegExp | undefined;
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment) || segment === "*" || segment === "**") {
      minimum = 0;
      maximum = actual.length - actualIndex;
    } else if (/^\[\.\.\.[^\]]+\]$/.test(segment)) {
      maximum = actual.length - actualIndex;
    } else if (/^\[\[[^\]]+\]\]$/.test(segment)) {
      minimum = 0;
    } else if (/^\[[^\]]+\]$/.test(segment)) {
      // One required file-router parameter.
    } else if (segment.startsWith(":")) {
      const parameter = /^:[\w]+(?:\((.*)\))?([?*+]?)$/.exec(segment);
      if (!parameter) return false;
      const modifier = parameter[2];
      minimum = modifier === "?" || modifier === "*" ? 0 : 1;
      maximum = modifier === "*" || modifier === "+" ? actual.length - actualIndex : 1;
      if (parameter[1]) {
        try { constraint = new RegExp(`^(?:${parameter[1]})$`); } catch { return false; }
      }
    } else {
      return segment === actual[actualIndex] && visit(patternIndex + 1, actualIndex + 1);
    }
    for (let count = minimum; count <= maximum && actualIndex + count <= actual.length; count++) {
      if (constraint && !actual.slice(actualIndex, actualIndex + count).every((part) => constraint!.test(part))) continue;
      if (visit(patternIndex + 1, actualIndex + count)) return true;
    }
    return false;
  };
  return visit(0, 0);
}

export function matchesAnyDeclaredRoute(url: string, declarations: Iterable<string>): boolean {
  for (const declaration of declarations) {
    if (matchesDeclaredRoute(url, declaration)) return true;
  }
  return false;
}
