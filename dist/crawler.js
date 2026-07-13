import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { detectProjectFramework } from "./framework.js";
const SOURCE_EXTENSIONS = "{js,jsx,ts,tsx,mjs,cjs,vue,astro}";
const GLOB_IGNORE = ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"];
/** Converts path separators to URL separators on every operating system. */
function toPosixPath(filePath) {
    return filePath.replaceAll(path.sep, "/");
}
/** Produces a normalized URL route while preserving dynamic placeholders. */
function normalizeRoute(route) {
    const segments = route
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean)
        // App Router route groups and parallel slots do not appear in public URLs.
        .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
        .filter((segment) => !segment.startsWith("@"));
    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}
/** Removes duplicates and returns deterministic, alphabetically sorted routes. */
function finalizeRoutes(routes) {
    return [...new Set([...routes].map(normalizeRoute))].sort((a, b) => a.localeCompare(b, "en"));
}
/** Finds files relative to a project without traversing generated directories. */
async function findFiles(projectPath, patterns) {
    return fg(patterns, {
        cwd: projectPath,
        onlyFiles: true,
        unique: true,
        ignore: GLOB_IGNORE,
    });
}
/** Discovers routes from both supported Next.js router conventions. */
async function crawlNext(projectPath) {
    const [appFiles, pageFiles] = await Promise.all([
        findFiles(projectPath, [
            `app/**/page.${SOURCE_EXTENSIONS}`,
            `src/app/**/page.${SOURCE_EXTENSIONS}`,
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
    const pageRoutes = pageFiles
        .map(toPosixPath)
        .map((file) => file.replace(/^(?:src\/)?pages\//, ""))
        // API endpoints and Next.js special files are not browser pages.
        .filter((file) => !file.startsWith("api/") && !file.startsWith("_api/"))
        .filter((file) => !file.split("/").at(-1)?.startsWith("_"))
        .map((file) => file.replace(/\.[^.]+$/, "").replace(/(?:^|\/)index$/, ""));
    return [...appRoutes, ...pageRoutes];
}
/** Extracts literal route paths used by common client-side router configs. */
function extractDeclaredRoutes(source) {
    const routes = [];
    const patterns = [
        /<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']/g,
        /\bpath\s*:\s*["']([^"']*)["']/g,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const candidate = match[1];
            if (candidate !== undefined && candidate !== "**" && !candidate.includes("*")) {
                routes.push(candidate || "/");
            }
        }
    }
    return routes;
}
/** Provides basic discovery for React Router, Vite, Angular, and Vue projects. */
async function crawlDeclaredRoutes(projectPath) {
    const files = await findFiles(projectPath, [
        `src/**/*.${SOURCE_EXTENSIONS}`,
        `app/**/*.${SOURCE_EXTENSIONS}`,
    ]);
    const sources = await Promise.all(files.map((file) => fs.readFile(path.join(projectPath, file), "utf8")));
    return sources.flatMap(extractDeclaredRoutes);
}
/** Discovers file-based pages used by Nuxt and Astro. */
async function crawlFileBasedPages(projectPath) {
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
const STRATEGIES = {
    "Next.js": crawlNext,
    React: crawlDeclaredRoutes,
    "React + Vite": crawlDeclaredRoutes,
    Vite: crawlDeclaredRoutes,
    Angular: crawlDeclaredRoutes,
    Vue: crawlDeclaredRoutes,
    Nuxt: crawlFileBasedPages,
    Astro: crawlFileBasedPages,
};
/**
 * Discovers every statically identifiable browser route in a frontend project.
 * Dynamic segments remain placeholders because generating fake data belongs to
 * future test configuration, not route discovery.
 */
export async function discoverRoutes(projectPath) {
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
export async function crawlProject(projectPath) {
    const { framework, routes } = await discoverRoutes(projectPath);
    console.log("🌐 Crawling Project...\n");
    console.log(`✔ Framework : ${framework}\n`);
    console.log(`✔ Found ${routes.length} Routes\n`);
    for (const route of routes)
        console.log(route);
    console.log("");
    return routes;
}
