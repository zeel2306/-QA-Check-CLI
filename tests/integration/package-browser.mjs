import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Generate probes inside the consumer: all browser/runtime imports remain isolated.
export async function configureConsumerBrowser({consumer, output, env, run, loaderArgs}) {
  // Resolve from the installed consumer, never the source dependency or runner Chrome.
  const browserSetup = path.join(consumer, 'browser-setup.mjs');
  await fs.writeFile(browserSetup, `import {chromium} from 'playwright';
import {Launcher} from 'chrome-launcher';
import fs from 'node:fs/promises';
import os from 'node:os';
let discovered; try { discovered=Launcher.getFirstInstallation(); } catch(error) { discovered=String(error); }
const executable=await fs.realpath(chromium.executablePath());
await fs.access(executable);
await fs.writeFile(process.argv[2], JSON.stringify({executable,previousChromePath:process.env.CHROME_PATH??null,previousAutoDiscovery:discovered,platform:process.platform,node:process.version,freeMemory:os.freemem(),totalMemory:os.totalmem(),loadAverage:os.loadavg(),flags:['--headless','--no-sandbox','--disable-gpu'],launchBudgetMs:15000},null,2));`);
  const browserEvidence = path.join(output, 'browser-environment.json');
  assert.equal((await run('browser-setup', [browserSetup, browserEvidence])).code, 0);
  const { executable } = JSON.parse(await fs.readFile(browserEvidence, 'utf8'));
  env.CHROME_PATH = executable;
  const browserProbe = path.join(consumer, 'browser-probe.mjs');
  await fs.writeFile(browserProbe, `import {Launcher} from 'chrome-launcher';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {launchLighthouseChrome} from './node_modules/qa-check-cli/dist/core/lighthouseChrome.js';
assert.equal(await fs.realpath(Launcher.getFirstInstallation()),process.env.CHROME_PATH,'Lighthouse must select consumer Chromium');
const started=Date.now(); let chrome;
try {
  chrome=await launchLighthouseChrome({chromeFlags:['--headless','--no-sandbox','--disable-gpu'],logLevel:'verbose',maxConnectionRetries:28,connectionPollInterval:500});
  const response=await fetch('http://127.0.0.1:'+chrome.port+'/json/version',{signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error('Chrome CDP probe HTTP '+response.status);
  console.log(JSON.stringify({pid:chrome.pid,port:chrome.port,startupMs:Date.now()-started,cdp:await response.json()}));
} finally { if(chrome){await chrome.kill();console.log('Owned probe Chrome stopped');} }`);
  assert.equal((await run('browser-probe', [...loaderArgs, browserProbe])).code, 0, 'Consumer Chromium CDP launch failed; inspect browser-probe.log');
}
