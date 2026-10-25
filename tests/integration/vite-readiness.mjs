import { stripVTControlCharacters } from 'node:util';

/** Vite decorates the port with ANSI even when stdout is a pipe. */
export function waitForVite(child, { timeoutMs = 30000, probe = fetch } = {}) {
  return new Promise((resolve, reject) => {
    let output = '';
    let url;
    let probing = false;
    let finished = false;
    let lastProbe = 'No URL announced';
    const cancellation = new AbortController();
    const diagnostic = () => `pid=${child.pid}; exit=${child.exitCode}; signal=${child.signalCode}; url=${url || 'unannounced'}; probe=${lastProbe}; stdout=${JSON.stringify(output.slice(-8000))}`;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cancellation.abort();
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      child.stdout.removeListener('data', onData);
      if (error) reject(new Error(`${error}; ${diagnostic()}`));
      else resolve(url);
    };
    const onError = error => finish(`Vite launch failed: ${error.message}`);
    const onExit = (code, signal) => finish(`Vite exited before readiness (code=${code}, signal=${signal})`);
    const poll = async () => {
      if (probing || !url) return;
      probing = true;
      while (!finished) {
        try {
          const response = await probe(url, { signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(1000)]) });
          lastProbe = `HTTP ${response.status}`;
          await response.body?.cancel();
          if (response.status === 200) { finish(); break; }
        } catch (error) { lastProbe = error.message; }
        if (!finished) await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    const onData = data => {
      output += data.toString();
      // Strip after accumulation so control sequences split across chunks work.
      url ||= stripVTControlCharacters(output).match(/http:\/\/127\.0\.0\.1:\d+(?=\/)/)?.[0];
      void poll();
    };
    const timer = setTimeout(() => finish('Vite readiness timed out'), timeoutMs);
    child.once('error', onError);
    child.once('exit', onExit);
    child.stdout.on('data', onData);
    if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode, child.signalCode);
  });
}
