import { glob, type GlobOptions } from "tinyglobby";
import fs from "node:fs";

/** The file-discovery options used by QA's scanners and build snapshots. */
type SourceGlobOptions = Pick<GlobOptions,
  "cwd" | "ignore" | "dot" | "onlyFiles" | "followSymbolicLinks" | "fs"
> & { unique?: true };

/** Preserve file-only glob semantics without the vulnerable micromatch/braces chain. */
export default async function sourceGlob(patterns: string | string[], options: SourceGlobOptions = {}): Promise<string[]> {
  const { unique: _unique, ...settings } = options;
  let discoveryError: NodeJS.ErrnoException | undefined;
  // fdir suppresses callback errors by default. Retain fast-glob's behavior:
  // disappearing/missing paths are tolerated; access/I/O failures must reject.
  function observeErrors<T extends typeof fs.readdir | typeof fs.realpath | typeof fs.stat>(operation: T): T {
    return ((...args: unknown[]) => {
      const callback = args.pop() as (error: NodeJS.ErrnoException | null, ...values: unknown[]) => void;
      Reflect.apply(operation, fs, [...args, (error: NodeJS.ErrnoException | null, ...values: unknown[]) => {
        if (error && error.code !== "ENOENT") discoveryError ??= error;
        callback(error, ...values);
      }]);
    }) as T;
  }
  const adapter = {
    ...settings.fs,
    readdir: observeErrors(settings.fs?.readdir ?? fs.readdir),
    realpath: observeErrors(settings.fs?.realpath ?? fs.realpath),
    stat: observeErrors(settings.fs?.stat ?? fs.stat),
  };
  // tinyglobby otherwise expands literal directory patterns, unlike fast-glob.
  const files = await glob(patterns, { ...settings, fs: adapter, expandDirectories: false });
  if (discoveryError) throw discoveryError;
  return [...new Set(files)];
}
