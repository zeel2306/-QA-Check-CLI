import path from "path";

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stripVolatileQueryParams(rawUrl: string): string {
  if (!rawUrl) return "";
  let norm = rawUrl.trim();
  const qIdx = norm.indexOf("?");
  if (qIdx === -1) return norm;

  const base = norm.slice(0, qIdx);
  const hashIdx = norm.indexOf("#", qIdx);
  const queryStr = hashIdx === -1 ? norm.slice(qIdx + 1) : norm.slice(qIdx + 1, hashIdx);
  const hashStr = hashIdx === -1 ? "" : norm.slice(hashIdx);

  try {
    const params = new URLSearchParams(queryStr);
    const volatileKeys = [
      "_rsc",
      "_next",
      "__nextDataReq",
      "v",
      "cb",
      "cacheBust",
      "cachebust",
      "_ts",
      "timestamp",
      "t",
      "nonce",
      "request_id",
      "req_id",
      "rid",
    ];
    for (const key of volatileKeys) {
      params.delete(key);
    }

    const cleanQuery = params.toString();
    return cleanQuery ? `${base}?${cleanQuery}${hashStr}` : `${base}${hashStr}`;
  } catch {
    return norm.split(/[?#]/)[0] || norm;
  }
}

/**
 * Normalizes any file path, relative route, or URL to a canonical page identity.
 */
export function toCanonicalRoute(inputPathOrUrl: string): string {
  if (!inputPathOrUrl) return "/";

  let raw = inputPathOrUrl.trim();

  // Strip volatile query parameters first
  raw = stripVolatileQueryParams(raw);

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
  raw = stripVolatileQueryParams(raw);

  // Handle external URLs
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname === "0.0.0.0" ||
        u.hostname.endsWith(".local")
      ) {
        raw = u.pathname;
      } else {
        return `${u.origin}${u.pathname}`;
      }
    } catch {
      // Fallback
    }
  }

  raw = raw.split(/[?#]/)[0] || "";
  raw = raw.replaceAll("\\", "/");

  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep raw
  }

  if (raw.startsWith("/")) {
    if (raw === "/index.html") return "/";
    return raw;
  }

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

export function toCanonicalAssetPath(rawSrcOrUrl: string, sourceRoute: string): string {
  return toCanonicalTargetHref(rawSrcOrUrl, sourceRoute);
}

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

export interface CanonicalObservation {
  checkName: string;
  message: string;
  route?: string;
  url?: string;
}

export type CanonicalCategory =
  | "Code Quality"
  | "SEO"
  | "Accessibility"
  | "Performance"
  | "Network"
  | "Console"
  | "Links"
  | "Images"
  | "Responsive"
  | "Build"
  | "TypeScript"
  | "ESLint"
  | "API Testing";

export interface CanonicalObservation {
  checkName: string;
  message: string;
  route?: string;
  url?: string;
}

export interface CanonicalDefect {
  id: string;
  category: CanonicalCategory;
  title: string;
  canonicalTarget: string;
  primaryScanner: string;
  observedBy: string[];
  observations: CanonicalObservation[];
}

export function correlateCanonicalDefects(results: any[]): CanonicalDefect[] {
  const map = new Map<string, CanonicalDefect>();

  for (const result of results || []) {
    if (!result || result.status === "PASS" || result.status === "NOT_APPLICABLE" || result.status === "SKIPPED") continue;

    const checkName = result.name;

    const addObs = (
      category: CanonicalCategory,
      title: string,
      canonicalTarget: string,
      primaryScanner: string,
      obsMessage: string,
      route?: string,
      url?: string
    ) => {
      const targetClean = canonicalTarget.trim().toLowerCase();
      const id = hashString(`${category}|${targetClean}`);
      if (!map.has(id)) {
        map.set(id, {
          id,
          category,
          title,
          canonicalTarget: canonicalTarget.trim(),
          primaryScanner,
          observedBy: [checkName],
          observations: [{ checkName, message: obsMessage, route, url }],
        });
      } else {
        const existing = map.get(id)!;
        if (!existing.observedBy.includes(checkName)) {
          existing.observedBy.push(checkName);
        }
        existing.observations.push({ checkName, message: obsMessage, route, url });
      }
    };

    if (checkName === "Broken Images") {
      const issues = Array.isArray(result.data?.issues) ? result.data.issues : Array.isArray(result.data?.missingAssets) ? result.data.missingAssets : [];
      for (const item of issues) {
        const rawTarget = item.url || item.path || item.src || item.file || item.target || "";
        const target = toCanonicalRoute(rawTarget);
        addObs("Images", `Missing Image Asset: ${target}`, target, "Broken Images", item.message || `Missing image asset: ${target}`, item.route, item.url);
      }
    } else if (checkName === "Broken Links") {
      const issues = Array.isArray(result.data?.issues) ? result.data.issues : Array.isArray(result.data?.broken) ? result.data.broken : [];
      for (const item of issues) {
        const rawTarget = item.url || item.href || item.target || "";
        const type = item.type || "";
        if (type === "suspicious-hash-link" || rawTarget === "#" || rawTarget === "(empty)" || type === "javascript-link") {
          const loc = item.file || item.route || "source";
          const target = `${loc}#href=${rawTarget}`;
          const title = type === "javascript-link" ? `JavaScript Link: ${loc}` : `Suspicious Hash Link: ${loc}`;
          addObs("Links", title, target, "Broken Links", item.message || item.reason || title, item.route, item.url);
        } else {
          const target = toCanonicalRoute(rawTarget);
          addObs("Links", `Broken Internal Link: ${target}`, target, "Broken Links", item.message || `Broken link: ${target}`, item.route, item.url);
        }
      }
    } else if (checkName === "Network Errors") {
      const issues = Array.isArray(result.data?.issues) ? result.data.issues : [];
      for (const item of issues) {
        const rawUrl = item.url || item.route || "";
        const cleanUrl = stripVolatileQueryParams(rawUrl);
        const normTarget = toCanonicalRoute(cleanUrl);

        let category: CanonicalCategory = "Network";
        let primaryScanner = "Network Errors";
        let title = `Network Failure: ${normTarget}`;

        if (normTarget.startsWith("/images/") || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(normTarget)) {
          category = "Images";
          primaryScanner = "Broken Images";
          title = `Missing Image Asset: ${normTarget}`;
        } else if (!normTarget.startsWith("/api/") && !normTarget.startsWith("api/")) {
          category = "Links";
          primaryScanner = "Broken Links";
          title = `Broken Internal Link: ${normTarget}`;
        }

        addObs(category, title, normTarget, primaryScanner, item.message || `Network error ${item.status || 404}: ${normTarget}`, item.route, item.url);
      }
    } else if (checkName === "Console Errors") {
      const issues = Array.isArray(result.data?.issues) ? result.data.issues : Array.isArray(result.data) ? result.data : [];
      for (const item of issues) {
        const type = item.type || "";
        const msg = item.message || "";

        if (type === "resource-load-error" || msg.includes("Failed to load resource") || msg.includes("404")) {
          const match = msg.match(/https?:\/\/[^\s"']+/i) || msg.match(/\/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+/);
          const rawTarget = item.url || (match ? match[0] : "");
          if (rawTarget && rawTarget !== item.route && rawTarget !== "/") {
            const cleanUrl = stripVolatileQueryParams(rawTarget);
            const normTarget = toCanonicalRoute(cleanUrl);
            let category: CanonicalCategory = "Links";
            let primaryScanner = "Broken Links";
            let title = `Broken Internal Link: ${normTarget}`;
            if (normTarget.startsWith("/images/") || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(normTarget)) {
              category = "Images";
              primaryScanner = "Broken Images";
              title = `Missing Image Asset: ${normTarget}`;
            } else if (normTarget.startsWith("/api/")) {
              category = "Network";
              primaryScanner = "Network Errors";
              title = `Network Failure: ${normTarget}`;
            }
            addObs(category, title, normTarget, primaryScanner, msg, item.route, item.url);
            continue;
          }
        }

        const sig = `console-error:${msg}`;
        addObs("Console", `Console Error: ${msg.slice(0, 60)}`, sig, "Console Errors", msg, item.route);
      }
    } else if (checkName === "ESLint") {
      const issues = Array.isArray(result.data?.issues) ? result.data.issues : [];
      for (const item of issues) {
        const target = `${item.file}:${item.line}:${item.column} [${item.ruleId}]`;
        addObs("ESLint", `ESLint [${item.ruleId}]: ${item.file}:${item.line}`, target, "ESLint", item.message, item.file);
      }
    } else if (checkName === "Code Quality Insights") {
      const issues = Array.isArray(result.data?.issues) ? result.data.issues : [];
      for (const item of issues) {
        const target = item.file || item.route || item.message || "signal";
        const title = item.type ? item.type.replace(/[-_]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) : "Code Quality Signal";
        addObs("Code Quality", title, `${item.type}:${target}`, "Code Quality Insights", item.message || title, item.route || item.file);
      }
    } else if (checkName === "API Testing") {
      const resultsList = Array.isArray(result.data?.results) ? result.data.results : [];
      for (const item of resultsList) {
        if (item.status === "FAIL") {
          const rawUrl = item.url || "";
          const pathOnly = rawUrl.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || rawUrl;
          const method = (item.method || "GET").toUpperCase();
          const target = `${method} ${toCanonicalRoute(pathOnly)}`;
          const title = `API Contract Failure: ${item.name}`;
          addObs("API Testing", title, target, "API Testing", item.message || title, toCanonicalRoute(pathOnly), item.url);
        }
      }
    } else {
      const category: CanonicalCategory =
        checkName.includes("SEO") ? "SEO" :
        checkName.includes("Accessibility") ? "Accessibility" :
        checkName.includes("Responsive") ? "Responsive" :
        checkName.includes("TypeScript") ? "TypeScript" :
        checkName.includes("Build") ? "Build" :
        checkName.includes("Performance") ? "Performance" : "Code Quality";

      const issues = Array.isArray(result.data?.issues) ? result.data.issues : [];
      if (issues.length > 0) {
        for (const item of issues) {
          const target = item.route || item.file || item.selector || item.message || checkName;
          const title = item.type ? item.type.replace(/[-_]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) : `${checkName} Issue`;
          addObs(category, title, `${checkName}:${target}`, checkName, item.message || title, item.route || item.file);
        }
      } else if (result.message && typeof result.score !== "number") {
        addObs(category, `${checkName} Warning`, `${checkName}:${result.message}`, checkName, result.message);
      }
    }
  }

  return [...map.values()];
}
