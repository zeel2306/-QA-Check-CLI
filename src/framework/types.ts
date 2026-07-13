export type PackageManager =
  | "npm"
  | "yarn"
  | "pnpm"
  | "bun"
  | "composer"
  | "gradle"
  | "maven";

export type ProjectLanguage =
  | "TypeScript"
  | "JavaScript"
  | "PHP"
  | "Dart"
  | "Swift"
  | "Kotlin"
  | "Java"
  | "C#"
  | "Python";

export interface FrameworkDetectionResult {
  detected: boolean;
  framework: string;
  version?: string;
  language?: ProjectLanguage;
  packageManager?: PackageManager;
  buildTool?: string;
  projectPath?: string;
}

export interface DetectedFramework
  extends Omit<FrameworkDetectionResult, "detected"> {
  detected: true;
  projectPath: string;
}

export interface FrameworkDetector {
  readonly name: string;
  readonly priority: number;
  detect(context: DetectionContext): FrameworkDetectionResult;
}

export interface DetectionContext {
  readonly inputPath: string;
  readonly projectPath: string;
  readonly files: ReadonlySet<string>;
  readonly directories: ReadonlySet<string>;
  readonly packageJson?: PackageJson;
  readonly composerJson?: ComposerJson;
  readonly pubspec?: Record<string, unknown>;

  hasFile(relativePath: string): boolean;
  hasAnyFile(relativePaths: readonly string[]): boolean;
  hasDirectory(relativePath: string): boolean;
  hasAnyDirectory(relativePaths: readonly string[]): boolean;
  findFile(predicate: (relativePath: string) => boolean): string | undefined;
  readText(relativePath: string): string | undefined;
  dependencyVersion(packageName: string): string | undefined;
  composerDependencyVersion(packageName: string): string | undefined;
}

export interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface ComposerJson {
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
  [key: string]: unknown;
}
