export function detected(framework, context, options = {}) {
    return {
        detected: true,
        framework,
        version: options.version,
        language: options.language ?? detectLanguage(context),
        packageManager: options.packageManager ?? detectPackageManager(context),
        buildTool: options.buildTool ?? detectBuildTool(context),
    };
}
export function notDetected(framework) {
    return { detected: false, framework };
}
export function hasDependency(context, packageName) {
    return Boolean(context.dependencyVersion(packageName));
}
export function hasAnyDependency(context, packageNames) {
    return packageNames.some((packageName) => hasDependency(context, packageName));
}
export function hasComposerDependency(context, packageName) {
    return Boolean(context.composerDependencyVersion(packageName));
}
export function detectPackageManager(context) {
    if (context.hasFile("pnpm-lock.yaml"))
        return "pnpm";
    if (context.hasAnyFile(["yarn.lock", ".yarnrc.yml"]))
        return "yarn";
    if (context.hasAnyFile(["bun.lockb", "bun.lock"]))
        return "bun";
    if (context.hasFile("package-lock.json"))
        return "npm";
    if (context.hasFile("composer.lock") || context.hasFile("composer.json"))
        return "composer";
    if (context.hasAnyFile(["gradlew", "gradlew.bat", "build.gradle", "build.gradle.kts"]))
        return "gradle";
    if (context.hasFile("pom.xml"))
        return "maven";
    return context.packageJson ? "npm" : undefined;
}
export function detectBuildTool(context) {
    const nextConfig = context.findFile((file) => /^next\.config\.(js|mjs|cjs|ts)$/.test(file));
    const nextConfigSource = nextConfig ? context.readText(nextConfig) : undefined;
    if (nextConfigSource && /turbo|turbopack/i.test(nextConfigSource))
        return "Turbopack";
    if (hasDependency(context, "vite") || context.findFile((file) => /^vite\.config\./.test(file)))
        return "Vite";
    if (hasDependency(context, "webpack"))
        return "Webpack";
    if (hasDependency(context, "parcel"))
        return "Parcel";
    if (hasDependency(context, "rollup"))
        return "Rollup";
    if (context.hasAnyFile(["build.gradle", "build.gradle.kts"]))
        return "Gradle";
    if (context.hasFile("pom.xml"))
        return "Maven";
    return undefined;
}
export function detectLanguage(context) {
    if (context.findFile((file) => /\.(ts|tsx)$/.test(file)))
        return "TypeScript";
    if (context.findFile((file) => /\.dart$/.test(file)))
        return "Dart";
    if (context.findFile((file) => /\.swift$/.test(file)))
        return "Swift";
    if (context.findFile((file) => /\.(kt|kts)$/.test(file)))
        return "Kotlin";
    if (context.findFile((file) => /\.cs$/.test(file)) || context.findFile((file) => /\.csproj$/.test(file)))
        return "C#";
    if (context.findFile((file) => /\.java$/.test(file)) || context.hasFile("pom.xml"))
        return "Java";
    if (context.findFile((file) => /\.py$/.test(file)))
        return "Python";
    if (context.findFile((file) => /\.php$/.test(file)) || context.hasFile("composer.json"))
        return "PHP";
    if (context.findFile((file) => /\.(js|jsx|mjs|cjs)$/.test(file)) || context.packageJson)
        return "JavaScript";
    return undefined;
}
export function packageVersion(context, packageName) {
    return context.dependencyVersion(packageName);
}
