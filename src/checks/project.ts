import fs from "fs";
import path from "path";
import type { Check, CheckResult } from "../types/result.js";
import { runCommand } from "../utils.js";

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

type Validation = {
  ok: boolean;
  message: string;
  data?: unknown;
};

function commandName(command: string): string {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function exists(projectPath: string, relativePath: string): boolean {
  return fs.existsSync(path.join(projectPath, relativePath));
}

function findFiles(projectPath: string, predicate: (file: string) => boolean, maxDepth = 6): string[] {
  const found: string[] = [];

  const walk = (currentPath: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (["node_modules", "vendor", ".git", "build", "dist"].includes(entry.name)) continue;
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(projectPath, absolutePath).replaceAll(path.sep, "/");
      if (entry.isDirectory()) walk(absolutePath, depth + 1);
      else if (entry.isFile() && predicate(relativePath)) found.push(relativePath);
    }
  };

  walk(projectPath, 0);
  return found;
}

export class ShellCheck implements Check<CommandResult> {
  constructor(
    readonly name: string,
    private readonly command: string,
    private readonly args: string[],
    private readonly unavailableMessage?: string,
  ) {}

  async run(projectPath: string): Promise<CheckResult<CommandResult>> {
    const started = performance.now();
    const data = await runCommand(this.command, this.args, projectPath);
    const unavailable = data.exitCode === -1;

    return {
      name: this.name,
      status: unavailable ? "SKIPPED" : data.success ? "PASS" : "FAIL",
      message: data.success ? "Passed" : (this.unavailableMessage ?? (data.stderr || data.stdout)),
      duration: performance.now() - started,
      data,
    };
  }
}

export class ValidationCheck implements Check<Validation> {
  constructor(
    readonly name: string,
    private readonly validate: (projectPath: string) => Validation | Promise<Validation>,
  ) {}

  async run(projectPath: string): Promise<CheckResult<Validation>> {
    const started = performance.now();
    const data = await this.validate(projectPath);

    return {
      name: this.name,
      status: data.ok ? "PASS" : "WARNING",
      message: data.message,
      duration: performance.now() - started,
      data,
    };
  }
}

export const composerValidation = () =>
  new ShellCheck("Composer Validation", commandName("composer"), ["validate", "--no-check-publish"]);

export const phpVersionCheck = () =>
  new ShellCheck("PHP Version", commandName("php"), ["-v"]);

export const phpSyntaxCheck = () =>
  new ValidationCheck("PHP Syntax", async (projectPath) => {
    const phpFiles = findFiles(projectPath, (file) => file.endsWith(".php"));
    const failures: string[] = [];

    for (const file of phpFiles.slice(0, 200)) {
      const result = await runCommand(commandName("php"), ["-l", file], projectPath);
      if (!result.success) failures.push(`${file}: ${result.stderr || result.stdout}`);
    }

    return {
      ok: failures.length === 0,
      message: failures.length ? `${failures.length} PHP syntax issue(s)` : `${phpFiles.length} PHP file(s) checked`,
      data: { checked: phpFiles.length, failures },
    };
  });

export const artisanCheck = () =>
  new ValidationCheck("Artisan Check", (projectPath) => ({
    ok: exists(projectPath, "artisan"),
    message: exists(projectPath, "artisan") ? "artisan found" : "artisan file not found",
  }));

export const laravelRouteCheck = () =>
  new ShellCheck("Route Check", commandName("php"), ["artisan", "route:list"]);

export const bladeValidation = () =>
  new ValidationCheck("Blade Validation", (projectPath) => {
    const blades = findFiles(projectPath, (file) => file.endsWith(".blade.php"));
    return {
      ok: blades.length > 0,
      message: blades.length ? `${blades.length} Blade template(s) found` : "No Blade templates found",
      data: blades.slice(0, 100),
    };
  });

export const publicFolderCheck = () =>
  new ValidationCheck("Public Folder Check", (projectPath) => ({
    ok: exists(projectPath, "public") || exists(projectPath, "public/index.php") || exists(projectPath, "index.html"),
    message: exists(projectPath, "public") || exists(projectPath, "public/index.php") || exists(projectPath, "index.html")
      ? "Public entry point found"
      : "No public entry point found",
  }));

export const storagePermissionCheck = () =>
  new ValidationCheck("Storage Permission Check", (projectPath) => {
    const storagePath = path.join(projectPath, "storage");
    let writable = false;
    try {
      fs.accessSync(storagePath, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }

    return {
      ok: writable,
      message: writable ? "storage directory is writable" : "storage directory is missing or not writable",
    };
  });

export const themeValidation = () =>
  new ValidationCheck("Theme Validation", (projectPath) => ({
    ok: exists(projectPath, "wp-content/themes") || exists(projectPath, "style.css"),
    message: exists(projectPath, "wp-content/themes") || exists(projectPath, "style.css")
      ? "Theme files found"
      : "No WordPress theme files found",
  }));

export const pluginValidation = () =>
  new ValidationCheck("Plugin Validation", (projectPath) => ({
    ok: exists(projectPath, "wp-content/plugins"),
    message: exists(projectPath, "wp-content/plugins") ? "Plugin directory found" : "Plugin directory not found",
  }));

export const htmlValidation = () =>
  new ValidationCheck("HTML Validation", (projectPath) => {
    const htmlFiles = findFiles(projectPath, (file) => file.endsWith(".html"));
    return { ok: htmlFiles.length > 0, message: `${htmlFiles.length} HTML file(s) found`, data: htmlFiles.slice(0, 100) };
  });

export const cssValidation = () =>
  new ValidationCheck("CSS Validation", (projectPath) => {
    const cssFiles = findFiles(projectPath, (file) => file.endsWith(".css"));
    return { ok: true, message: `${cssFiles.length} CSS file(s) found`, data: cssFiles.slice(0, 100) };
  });

export const flutterDoctor = () =>
  new ShellCheck("flutter doctor", commandName("flutter"), ["doctor"]);

export const pubspecValidation = () =>
  new ShellCheck("pubspec.yaml validation", commandName("flutter"), ["pub", "get", "--dry-run"]);

export const dartAnalyze = () =>
  new ShellCheck("dart analyze", commandName("dart"), ["analyze"]);

export const flutterTest = () =>
  new ShellCheck("flutter test", commandName("flutter"), ["test"]);

export const dependencyValidation = () =>
  new ValidationCheck("dependency validation", (projectPath) => ({
    ok: exists(projectPath, "pubspec.yaml") || exists(projectPath, "package.json"),
    message: exists(projectPath, "pubspec.yaml") || exists(projectPath, "package.json")
      ? "Dependency manifest found"
      : "No dependency manifest found",
  }));

export const assetValidation = () =>
  new ValidationCheck("Asset Validation", (projectPath) => {
    const assets = findFiles(projectPath, (file) => /\.(png|jpe?g|svg|webp|gif|ttf|otf|json)$/i.test(file));
    return { ok: true, message: `${assets.length} asset file(s) found`, data: assets.slice(0, 200) };
  });

export const metroValidation = () =>
  new ValidationCheck("Metro Validation", (projectPath) => ({
    ok: exists(projectPath, "metro.config.js") || exists(projectPath, "metro.config.cjs") || exists(projectPath, "package.json"),
    message: "Metro-compatible project shape checked",
  }));

export const androidValidation = () =>
  new ValidationCheck("Android Validation", (projectPath) => ({
    ok: exists(projectPath, "android"),
    message: exists(projectPath, "android") ? "Android project found" : "Android folder not found",
  }));

export const iosValidation = () =>
  new ValidationCheck("iOS Validation", (projectPath) => ({
    ok: exists(projectPath, "ios"),
    message: exists(projectPath, "ios") ? "iOS project found" : "iOS folder not found",
  }));

export const swiftBuild = () =>
  new ShellCheck("Swift Build", commandName("swift"), ["build"]);

export const swiftLint = () =>
  new ShellCheck("SwiftLint", commandName("swiftlint"), []);

export const packageValidation = () =>
  new ValidationCheck("Package Validation", (projectPath) => ({
    ok: exists(projectPath, "Package.swift") || Boolean(findFiles(projectPath, (file) => file.endsWith(".xcodeproj/project.pbxproj"), 3).length),
    message: exists(projectPath, "Package.swift") ? "Package.swift found" : "Xcode/Swift package shape checked",
  }));
