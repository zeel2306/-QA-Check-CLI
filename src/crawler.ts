import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";

import { detectProjectFramework } from "./framework.js";
import { extractDeclaredRoutes, normalizeDeclaredRoute, normalizeRoutePath } from "./utils/routes.js";

const SOURCE_EXTENSIONS = "{js,jsx,ts,tsx,mjs,cjs,vue,astro}";
const GLOB_IGNORE = ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"];

type CrawlerStrategy = (projectPath: string) => Promise<string[]>;

/** Converts path separators to URL separators on every operating system. */
function toPosixPath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

/** Produces a normalized URL route while preserving dynamic placeholders. */
function normalizeRoute(route: string): string {
  return normalizeDeclaredRoute(route);
}

/** Removes duplicates and returns deterministic, alphabetically sorted routes. */
function finalizeRoutes(routes: Iterable<string>): string[] {
  return [...new Set([...routes].map(normalizeRoute))].sort((a, b) =>
    a.localeCompare(b, "en")
  );
}

/** Finds files relative to a project without traversing generated directories. */
async function findFiles(projectPath: string, patterns: string[]): Promise<string[]> {
  return fg(patterns, {
    cwd: projectPath,
    onlyFiles: true,
    unique: true,
    ignore: GLOB_IGNORE,
  });
}

/** Discovers routes from both supported Next.js router conventions. */
async function crawlNext(projectPath: string): Promise<string[]> {
  const [appFiles, appRouteFiles, pageFiles] = await Promise.all([
    findFiles(projectPath, [
      `app/**/page.${SOURCE_EXTENSIONS}`,
      `src/app/**/page.${SOURCE_EXTENSIONS}`,
    ]),
    findFiles(projectPath, [
      `app/**/route.${SOURCE_EXTENSIONS}`,
      `src/app/**/route.${SOURCE_EXTENSIONS}`,
    ]),
    findFiles(projectPath, [
      `pages/**/*.${SOURCE_EXTENSIONS}`,
      `src/pages/**/*.${SOURCE_EXTENSIONS}`,
    ]),
  ]);

  const appRoutes = appFiles.map((file) => {
    const relative = toPosixPath(file).replace(/^(?:src\/)?app\//, "");
    return relative.replace(/(?:^|\/)page\.[^.]+$/, "");
  });

  const appApiRoutes = appRouteFiles.map((file) => {
    const relative = toPosixPath(file).replace(/^(?:src\/)?app\//, "");
    return relative.replace(/(?:^|\/)route\.[^.]+$/, "");
  });

  const pageRoutes = pageFiles
    .map(toPosixPath)
    .map((file) => file.replace(/^(?:src\/)?pages\//, ""))
    .filter((file) => !file.split("/").at(-1)?.startsWith("_"))
    .map((file) => file.replace(/\.[^.]+$/, "").replace(/(?:^|\/)index$/, ""));

  return [...appRoutes, ...appApiRoutes, ...pageRoutes];
}

/** Extracts literal route paths used by common client-side router configs. */
function extractRouteCandidates(source: string): string[] {
  const routes: string[] = extractDeclaredRoutes(source);
  const patterns = [
    /\brouterLink\s*:\s*["']([^"']*)["']/g,
    /<[Rr]outer-?[Ll]ink\b[^>]*\bto\s*=\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const candidate = match[1];
      if (candidate !== undefined && candidate !== "**" && !candidate.includes("*")) {
        routes.push(normalizeRoutePath(candidate));
      }
    }
  }

  return routes;
}

/** Provides basic discovery for React Router, Vite, Angular, and Vue projects. */
async function crawlDeclaredRoutes(projectPath: string, declarationsOnly = false): Promise<string[]> {
  const files = await findFiles(projectPath, [
    `src/**/*.${SOURCE_EXTENSIONS}`,
    `app/**/*.${SOURCE_EXTENSIONS}`,
    `projects/**/*.${SOURCE_EXTENSIONS}`,
  ]);
  const sources = await Promise.all(
    files.map((file) => fs.readFile(path.join(projectPath, file), "utf8"))
  );

  return sources.flatMap(declarationsOnly ? extractDeclaredRoutes : extractRouteCandidates);
}

/** Discovers file-based pages used by Nuxt and Astro. */
async function crawlFileBasedPages(projectPath: string): Promise<string[]> {
  const files = await findFiles(projectPath, [
    `pages/**/*.${SOURCE_EXTENSIONS}`,
    `src/pages/**/*.${SOURCE_EXTENSIONS}`,
  ]);
  return files
    .map(toPosixPath)
    .map((file) => file.replace(/^(?:src\/)?pages\//, ""))
    .filter((file) => !file.startsWith("api/"))
    .map((file) => file.replace(/\.[^.]+$/, "").replace(/(?:^|\/)index$/, ""));
}

/** Discovers Nitro server API endpoints used by Nuxt. */
async function crawlNitroRoutes(projectPath: string): Promise<string[]> {
  const [apiFiles, routeFiles] = await Promise.all([
    findFiles(projectPath, [
      `server/api/**/*.${SOURCE_EXTENSIONS}`,
      `src/server/api/**/*.${SOURCE_EXTENSIONS}`,
    ]),
    findFiles(projectPath, [
      `server/routes/**/*.${SOURCE_EXTENSIONS}`,
      `src/server/routes/**/*.${SOURCE_EXTENSIONS}`,
    ]),
  ]);

  const apiRoutes = apiFiles.map((file) => {
    let rel = toPosixPath(file).replace(/^(?:src\/)?server\/api\//, "");
    rel = rel.replace(/\.(?:get|post|put|delete|patch|options|head|connect|trace)\.[^.]+$/, "");
    rel = rel.replace(/\.[^.]+$/, "");
    rel = rel.replace(/(?:^|\/)index$/, "");
    return rel ? `/api/${rel}` : "/api";
  });

  const customRoutes = routeFiles.map((file) => {
    let rel = toPosixPath(file).replace(/^(?:src\/)?server\/routes\//, "");
    rel = rel.replace(/\.(?:get|post|put|delete|patch|options|head|connect|trace)\.[^.]+$/, "");
    rel = rel.replace(/\.[^.]+$/, "");
    rel = rel.replace(/(?:^|\/)index$/, "");
    return rel ? (rel.startsWith("/") ? rel : `/${rel}`) : "/";
  });

  return [...apiRoutes, ...customRoutes];
}

/** Discovers both file-based pages and Nitro API routes for Nuxt. */
async function crawlNuxt(projectPath: string): Promise<string[]> {
  const [pages, nitroRoutes] = await Promise.all([
    crawlFileBasedPages(projectPath),
    crawlNitroRoutes(projectPath),
  ]);
  return [...pages, ...nitroRoutes];
}

/** Discovers Express routes statically from app.METHOD, router.METHOD, and mounted routers. */
export async function crawlExpressRoutes(projectPath: string): Promise<string[]> {
  const files = await findFiles(projectPath, [
    `src/**/*.${SOURCE_EXTENSIONS}`,
    `app/**/*.${SOURCE_EXTENSIONS}`,
    `routes/**/*.${SOURCE_EXTENSIONS}`,
    `controllers/**/*.${SOURCE_EXTENSIONS}`,
    `*.${SOURCE_EXTENSIONS}`,
  ]);

  const fileContents = await Promise.all(
    files.map(async (file) => ({
      file,
      content: await fs.readFile(path.join(projectPath, file), "utf8").catch(() => ""),
    }))
  );

  const directRoutes: { method: string; path: string }[] = [];
  const routerRoutes = new Map<string, { method: string; path: string }[]>();
  const mounts: { prefix: string; targetVar: string }[] = [];

  for (const { content } of fileContents) {
    const routeRegex = /\b([a-zA-Z_$][\w$]*)\.(get|post|put|patch|delete|head|options|all)\s*\(\s*["']([^"']+)["']/gi;
    for (const match of content.matchAll(routeRegex)) {
      const varName = match[1]!;
      const method = match[2]!.toUpperCase();
      const rawPath = match[3]!;
      
      const methods = method === "ALL" 
        ? ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
        : [method];

      for (const m of methods) {
        if (varName === "app" || varName === "server" || varName === "express") {
          directRoutes.push({ method: m, path: rawPath });
        } else {
          if (!routerRoutes.has(varName)) {
            routerRoutes.set(varName, []);
          }
          routerRoutes.get(varName)!.push({ method: m, path: rawPath });
        }
      }
    }

    const mountRegex = /\b([a-zA-Z_$][\w$]*)\.use\s*\(\s*["']([^"']+)["']\s*,\s*([a-zA-Z_$][\w$]*)\b/gi;
    for (const match of content.matchAll(mountRegex)) {
      const prefix = match[2]!;
      const targetVar = match[3]!;
      mounts.push({ prefix, targetVar });
    }
  }

  const discovered = new Set<string>();

  for (const r of directRoutes) {
    const normPath = normalizeDeclaredRoute(r.path);
    discovered.add(`${r.method} ${normPath}`);
  }

  for (const mount of mounts) {
    const rList = routerRoutes.get(mount.targetVar) || [];
    for (const r of rList) {
      const combined = `${mount.prefix.replace(/\/$/, "")}${r.path.startsWith("/") ? r.path : `/${r.path}`}`;
      const normPath = normalizeDeclaredRoute(combined);
      discovered.add(`${r.method} ${normPath}`);
    }
  }

  for (const rList of routerRoutes.values()) {
    for (const r of rList) {
      const normPath = normalizeDeclaredRoute(r.path);
      discovered.add(`${r.method} ${normPath}`);
    }
  }

  return [...discovered];
}

/** Discovers static HTML pages in an HTML project. */
async function crawlHtmlPages(projectPath: string): Promise<string[]> {
  const files = await findFiles(projectPath, ["**/*.html"]);
  return files
    .map(toPosixPath)
    .filter((file) => !file.startsWith("node_modules/") && !file.startsWith("reports/") && !file.startsWith("dist/") && !file.startsWith("build/") && !file.startsWith("coverage/"))
    .map((file) => (file === "index.html" ? "/" : file.startsWith("/") ? file : `/${file}`));
}

const STRATEGIES: Readonly<Record<string, CrawlerStrategy>> = {
  HTML: crawlHtmlPages,
  "Next.js": crawlNext,
  React: crawlDeclaredRoutes,
  "React + Vite": crawlDeclaredRoutes,
  Vite: crawlDeclaredRoutes,
  Angular: crawlDeclaredRoutes,
  Vue: crawlDeclaredRoutes,
  Nuxt: crawlNuxt,
  Astro: crawlFileBasedPages,
  Express: crawlExpressRoutes,
};

/**
 * Discovers every statically identifiable browser route in a frontend project.
 * Dynamic segments remain placeholders because generating fake data belongs to
 * future test configuration, not route discovery.
 */
export async function discoverRoutes(projectPath: string): Promise<{ framework: string; routes: string[] }> {
  const canonicalPath = await fs.realpath(path.resolve(projectPath));
  const detection = detectProjectFramework(canonicalPath);
  const framework = detection.framework;
  const detectedProjectPath = detection.projectPath;
  const strategy = STRATEGIES[framework];

  return {
    framework,
    routes: strategy ? finalizeRoutes(await strategy(detectedProjectPath)) : [],
  };
}

/** Reuse framework discovery without accepting link destinations as proof a route exists. */
export async function discoverDeclaredApplicationRoutes(projectPath: string): Promise<string[]> {
  const detection = detectProjectFramework(projectPath);
  const root = detection.projectPath;
  if (detection.framework === "Next.js") return finalizeRoutes(await crawlNext(root));
  if (detection.framework === "Nuxt") return finalizeRoutes(await crawlNuxt(root));
  if (detection.framework === "Astro") return finalizeRoutes(await crawlFileBasedPages(root));
  if (detection.framework === "Express") return finalizeRoutes(await crawlExpressRoutes(root));
  return finalizeRoutes(await crawlDeclaredRoutes(root, true));
}

export type RouteCategory = "static" | "dynamic" | "api" | "framework";

export function classifyRoute(route: string): RouteCategory {
  const norm = route.replace(/^[A-Z]+\s+/, "").trim();
  if (norm.startsWith("/api/") || norm.startsWith("api/") || norm === "/api") {
    return "api";
  }
  if (norm.startsWith("/_next/") || norm.startsWith("_next/")) {
    return "framework";
  }
  if (/[\[\]:*]/.test(norm)) {
    return "dynamic";
  }
  return "static";
}

export async function crawlProject(projectPath: string): Promise<string[]> {
  const { framework, routes } = await discoverRoutes(projectPath);

  console.log("🌐 Crawling Project...\n");
  console.log(`✔ Framework : ${framework}\n`);

  console.log(`✔ Found ${routes.length} Routes\n`);
  for (const route of routes) console.log(route);
  console.log("");

  return routes;
}
