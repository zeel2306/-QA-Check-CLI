import { Launcher, type launch } from "chrome-launcher";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

/** Own the profile so chrome-launcher's synchronous Windows deletion cannot race Chrome exit. */
export const launchLighthouseChrome: typeof launch = async options => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "qa-check-lighthouse-"));
  // The launcher leaves its stderr log open when userDataDir is supplied.
  // Track only descriptors opened by this owned launcher and close them after exit.
  const descriptors = new Set<number>();
  const launcherFs: typeof fsSync = {
    ...fsSync,
    openSync: (...args: Parameters<typeof fsSync.openSync>) => { const fd = fsSync.openSync(...args); descriptors.add(fd); return fd; },
    closeSync: fd => { fsSync.closeSync(fd); descriptors.delete(fd); },
  };
  const launcher = new Launcher({ ...options, userDataDir: profile, handleSIGINT: false }, { fs: launcherFs });
  let cleanup: Promise<void> | undefined;
  const kill = () => cleanup ??= (async () => {
      const child = launcher.chromeProcess;
      launcher.kill();
      const deadline = Date.now() + 10_000;
      while (child?.pid) {
        try { process.kill(child.pid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") break; throw error; }
        if (Date.now() >= deadline) throw new Error(`Owned Chrome ${child.pid} did not exit during cleanup`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      // Chrome's extra debugging pipes can keep 'close' pending after process
      // exit; destroy only this launcher's streams after the owned tree is killed.
      for (const stream of child?.stdio ?? []) if (stream && "destroy" in stream) stream.destroy();
      for (const fd of descriptors) { fsSync.closeSync(fd); descriptors.delete(fd); }
      const resolved = path.resolve(profile);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("qa-check-lighthouse-")) throw new Error("Refusing to remove an unowned Chrome profile");
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    })();
  try { await launcher.launch(); }
  catch (error) { await kill(); throw error; }
  return {
    pid: launcher.chromeProcess!.pid!,
    port: launcher.port!,
    process: launcher.chromeProcess!,
    remoteDebuggingPipes: launcher.remoteDebuggingPipes ?? null,
    kill,
  };
};
