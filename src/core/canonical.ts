import path from "path";

/**
 * Normalizes any file path, relative route, or URL to a canonical page identity.
 *
 * Rules:
 *  - Strips protocol & domain (e.g. http://localhost:4173 => /)
 *  - Strips query parameters and fragment anchors (?v=1#sec => "")
 *  - Normalizes backslashes to forward slashes (\ => /)
 *  - Strips leading relative dots (./products.html => /products.html)
 *  - Normalizes index.html and /index.html => /
 *  - Preserves sub-routes (/blog/post.html)
 */
export function toCanonicalRoute(inputPathOrUrl: string): string {
  if (!inputPathOrUrl) return "/";

  let raw = inputPathOrUrl.trim();

  // Extract path component if full URL is supplied
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      // Fallback
    }
  }

  // Strip query strings and fragment identifiers
  raw = raw.split(/[?#]/)[0] || "";

  // Normalize backslashes to forward slashes
  raw = raw.replaceAll("\\", "/");

  // Remove leading dot slash if present
  raw = raw.replace(/^\.\//, "");

  // Add leading slash if missing
  if (!raw.startsWith("/")) {
    raw = `/${raw}`;
  }

  // Strip duplicate trailing slash (except root "/")
  if (raw.length > 1 && raw.endsWith("/")) {
    raw = raw.slice(0, -1);
  }

  // Normalize root index page representations
  if (raw === "/index.html") {
    return "/";
  }

  return raw;
}

/**
 * Resolves a target link or asset path relative to its canonical source route.
 */
export function toCanonicalTargetHref(rawHrefOrUrl: string, sourceRoute: string): string {
  if (!rawHrefOrUrl) return "";

  let raw = rawHrefOrUrl.trim();

  // Handle external URLs
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      // If it's a localhost, 127.0.0.1, or local server target:
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname === "0.0.0.0" ||
        u.hostname.endsWith(".local")
      ) {
        raw = u.pathname;
      } else {
        // External URL: keep origin + pathname, strip query & hash
        return `${u.origin}${u.pathname}`;
      }
    } catch {
      // Fallback
    }
  }

  // Strip query string and fragment anchor
  raw = raw.split(/[?#]/)[0] || "";

  // Normalize backslashes
  raw = raw.replaceAll("\\", "/");

  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep raw if decoding fails
  }

  // If absolute path
  if (raw.startsWith("/")) {
    if (raw === "/index.html") return "/";
    return raw;
  }

  // Resolve relative path against source page directory
  const canonicalSource = toCanonicalRoute(sourceRoute);
  let sourceDir = "/";
  if (canonicalSource !== "/") {
    const posixPath = canonicalSource.replaceAll("\\", "/");
    sourceDir = path.posix.dirname(posixPath);
    if (!sourceDir.endsWith("/")) sourceDir += "/";
  }

  const resolved = path.posix.normalize(path.posix.join(sourceDir, raw));
  if (resolved === "/index.html") return "/";
  return resolved.startsWith("/") ? resolved : `/${resolved}`;
}

/**
 * Resolves an asset path or URL relative to a canonical source route.
 */
export function toCanonicalAssetPath(rawSrcOrUrl: string, sourceRoute: string): string {
  return toCanonicalTargetHref(rawSrcOrUrl, sourceRoute);
}

/**
 * Merges static and runtime findings using canonical page identity and a stable defect target signature.
 * Preserves evidence in `sources: ["static", "runtime"]` and optional evidence record.
 */
export function deduplicateFindings<T extends Record<string, any>>(
  staticItems: T[],
  runtimeItems: T[],
  getSignature: (item: T, canonicalRoute: string) => string
): (T & { route: string; sources: ("static" | "runtime")[]; evidence?: Record<string, string> })[] {
  type MergedItem = T & { route: string; sources: ("static" | "runtime")[]; evidence?: Record<string, string> };
  const map = new Map<string, MergedItem>();

  for (const item of staticItems) {
    const canonicalRoute = toCanonicalRoute(String(item.route || "/"));
    const key = getSignature(item, canonicalRoute);

    if (!map.has(key)) {
      map.set(key, {
        ...item,
        route: canonicalRoute,
        sources: ["static"],
        evidence: { static: String(item.reason || "Static detection") },
      } as MergedItem);
    } else {
      const existing = map.get(key)!;
      if (!existing.sources.includes("static")) existing.sources.push("static");
      if (item.reason && existing.evidence) existing.evidence.static = String(item.reason);
    }
  }

  for (const item of runtimeItems) {
    const canonicalRoute = toCanonicalRoute(String(item.route || "/"));
    const key = getSignature(item, canonicalRoute);

    if (!map.has(key)) {
      map.set(key, {
        ...item,
        route: canonicalRoute,
        sources: ["runtime"],
        evidence: { runtime: String(item.reason || "Runtime detection") },
      } as MergedItem);
    } else {
      const existing = map.get(key)!;
      if (!existing.sources.includes("runtime")) existing.sources.push("runtime");
      if (item.reason && existing.evidence) existing.evidence.runtime = String(item.reason);
    }
  }

  return [...map.values()];
}
