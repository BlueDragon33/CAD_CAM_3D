import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.BROWSER_SMOKE_PORT || 4173);
const chromeDriverPort = Number(process.env.CHROMEDRIVER_PORT || 9515);
const basePath = process.env.GITHUB_PAGES === 'true' ? '/CAD_CAM_3D/' : '/';
const appUrl = `http://${host}:${port}${basePath}`;
const driverUrl = `http://${host}:${chromeDriverPort}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, fn, timeoutMs = 30000, intervalMs = 150) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? ': ' + String(lastError) : ''}`);
}

function capture(process, label) {
  let output = '';
  for (const stream of [process.stdout, process.stderr]) {
    stream?.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-20000);
    });
  }
  return () => output ? `\n--- ${label} output ---\n${output}` : '';
}

async function jsonRequest(url, options = {}) {
  const { timeoutMs = 15000, ...requestOptions } = options;
  const response = await fetch(url, {
    ...requestOptions,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', ...(requestOptions.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${text}`);
  return body;
}

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', host, '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
);
const driver = spawn(
  'chromedriver',
  ['--port=' + chromeDriverPort, '--allowed-ips='],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const previewOutput = capture(preview, 'vite preview');
const driverOutput = capture(driver, 'chromedriver');

let sessionId = null;
let downloadDir = null;

try {
  await waitFor('Vite preview', async () => {
    const response = await fetch(appUrl);
    return response.ok;
  });

  await waitFor('ChromeDriver', async () => {
    const response = await fetch(driverUrl + '/status');
    return response.ok;
  });

  const session = await jsonRequest(driverUrl + '/session', {
    method: 'POST',
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: 'chrome',
          'goog:chromeOptions': {
            args: [
              '--headless=new',
              '--no-sandbox',
              '--disable-gpu',
              '--disable-dev-shm-usage',
              '--window-size=1440,1000',
            ],
          },
        },
      },
    }),
  });
  sessionId = session.value.sessionId;

  const endpoint = (suffix) => driverUrl + '/session/' + sessionId + suffix;
  const execute = async (script, args = []) => {
    const result = await jsonRequest(endpoint('/execute/sync'), {
      method: 'POST',
      body: JSON.stringify({ script, args }),
    });
    return result.value;
  };
  const executeAsync = async (script, args = []) => {
    const result = await jsonRequest(endpoint('/execute/async'), {
      method: 'POST',
      body: JSON.stringify({ script, args }),
    });
    return result.value;
  };
  const bodyText = () => execute("return document.body ? document.body.innerText : '';");
  const waitText = (needle, present = true, timeoutMs = 30000) =>
    waitFor((present ? 'text ' : 'absence of ') + needle, async () => {
      const text = await bodyText();
      return present ? text.includes(needle) : !text.includes(needle);
    }, timeoutMs);
  const waitOperationResult = async (successNeedle, failureNeedles, timeoutMs = 60000) => {
    let lastText = '';
    try {
      const matched = await waitFor('operation result ' + successNeedle, async () => {
        lastText = await bodyText();
        if (lastText.includes(successNeedle)) return { ok: true, text: lastText };
        const failure = failureNeedles.find((needle) => lastText.includes(needle));
        if (failure) return { ok: false, text: lastText, failure };
        return null;
      }, timeoutMs, 250);
      if (!matched.ok) {
        throw new Error(
          'Operation reported failure marker "' + matched.failure + '". Current UI text:\n'
          + matched.text.slice(-6000),
        );
      }
      return matched.text;
    } catch (error) {
      if (String(error).includes('Operation reported failure marker')) throw error;
      throw new Error(
        String(error)
        + '\nCurrent UI text after timeout:\n'
        + lastText.slice(-6000),
      );
    }
  };
  const clickButton = async (label) => {
    const result = await execute(
      "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===arguments[0]); if(!b) return 'missing'; if(b.disabled) return 'disabled'; b.click(); return 'clicked';",
      [label],
    );
    if (result !== 'clicked') throw new Error(`Button "${label}" is ${result}.`);
  };
  const setLabelInput = async (label, value) => {
    const result = await execute(
      "const l=[...document.querySelectorAll('label')].find(x=>x.querySelector('span')?.textContent.trim()===arguments[0]); const i=l?.querySelector('input'); if(!i) return null; const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,String(arguments[1])); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return i.value;",
      [label, value],
    );
    if (result === null) throw new Error(`Input "${label}" was not found.`);
    await delay(120);
  };
  const inputValue = (label) => execute(
    "const l=[...document.querySelectorAll('label')].find(x=>x.querySelector('span')?.textContent.trim()===arguments[0]); return l?.querySelector('input')?.value ?? null;",
    [label],
  );
  const refresh = () => jsonRequest(endpoint('/refresh'), { method: 'POST', body: '{}' });
  const cdp = (cmd, params = {}) => jsonRequest(endpoint('/goog/cdp/execute'), {
    method: 'POST',
    body: JSON.stringify({ cmd, params }),
  });
  downloadDir = await mkdtemp(join(tmpdir(), 'cad-cam-3d-browser-smoke-'));
  await cdp('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true,
  });

  await jsonRequest(endpoint('/timeouts'), {
    method: 'POST',
    body: JSON.stringify({ script: 20000, pageLoad: 30000, implicit: 0 }),
  });
  await jsonRequest(endpoint('/url'), {
    method: 'POST',
    body: JSON.stringify({ url: appUrl }),
  });

  await waitText('CAD_CAM_3D');
  for (const required of ['Save Project', 'Open Project', 'Analyze Print', 'Undo', 'Redo', 'Registration clearance / side']) {
    await waitText(required);
  }

  const navigationSamples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    if (sample > 0) {
      await refresh();
      await waitText('CAD_CAM_3D');
    }
    const timing = await execute(
      "const n=performance.getEntriesByType('navigation')[0]; return n ? {dom:n.domContentLoadedEventEnd,load:n.loadEventEnd,duration:n.duration} : null;",
    );
    if (timing) navigationSamples.push(timing);
  }

  await setLabelInput('width', 300);
  await setLabelInput('depth', 40);
  await setLabelInput('height', 12);
  await clickButton('Analyze Print');
  await waitText('Exact split handoff', true, 45000);
  await waitText('0.20 mm/side clearance');

  await setLabelInput('Registration clearance / side', 0.30);
  await waitText('Exact split handoff', false);
  await clickButton('Analyze Print');
  await waitText('Exact split handoff', true, 45000);
  await waitText('0.30 mm/side clearance');
  await waitText('Export Aligned Split 3MF');

  console.log('Browser smoke: exact STEP start');
  const stepStartedAt = performance.now();
  await clickButton('Export STEP');
  await waitOperationResult(
    'STEP export PASS',
    ['STEP export blocked:', 'STEP export failed.'],
    60000,
  );
  const stepDurationMs = performance.now() - stepStartedAt;
  console.log('Browser smoke: exact STEP PASS in ' + stepDurationMs.toFixed(0) + 'ms');

  console.log('Browser smoke: aligned split start');
  const alignedStartedAt = performance.now();
  await clickButton('Export Aligned Split 3MF');
  await waitOperationResult(
    'Aligned Split 3MF PASS',
    ['Aligned Split 3MF blocked:', 'Aligned Split 3MF failed.'],
    90000,
  );
  const alignedDurationMs = performance.now() - alignedStartedAt;
  console.log('Browser smoke: aligned split PASS in ' + alignedDurationMs.toFixed(0) + 'ms');

  console.log('Browser smoke: Save/Open file round-trip start');
  await clickButton('Save Project');
  await waitText('Project saved · schema v13');
  const savedFileName = await waitFor('downloaded CAD project file', async () => {
    const names = await readdir(downloadDir);
    return names.find((name) => name.endsWith('.cad3d.json') && !name.endsWith('.crdownload')) ?? null;
  }, 20000, 200);
  const savedPath = join(downloadDir, savedFileName);
  const savedText = await readFile(savedPath, 'utf8');
  const savedDocument = JSON.parse(savedText);
  if (savedDocument.schemaVersion !== 13) {
    throw new Error(`Saved project schema expected v13, got ${savedDocument.schemaVersion}.`);
  }
  if (savedDocument.project?.printProfile?.fitCalibration?.registrationClearancePerSideMm !== 0.3) {
    throw new Error('Saved project did not persist 0.30 mm registration clearance.');
  }
  if (savedDocument.project?.dimensions?.width !== 300) {
    throw new Error('Saved project did not persist the 300 mm width used by the browser journey.');
  }

  await setLabelInput('Registration clearance / side', 0.45);
  await setLabelInput('width', 180);
  await waitFor('mutated calibration before Open', async () => Number(await inputValue('Registration clearance / side')) === 0.45);
  await waitFor('mutated width before Open', async () => Number(await inputValue('width')) === 180);

  const injected = await execute(
    "const input=document.querySelector('input.file-input[type=file]'); if(!input) return false; const f=new File([arguments[0]],arguments[1],{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(f); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); return true;",
    [savedText, savedFileName],
  );
  if (!injected) throw new Error('Open Project file input was not found for browser round-trip.');
  await waitText('Project opened · schema v13');
  await waitFor('opened calibration from saved file', async () => Number(await inputValue('Registration clearance / side')) === 0.3);
  await waitFor('opened width from saved file', async () => Number(await inputValue('width')) === 300);
  console.log('Browser smoke: Save/Open file round-trip PASS');

  const undoDisabledAfterOpen = await execute(
    "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Undo'); return b ? b.disabled : null;",
  );
  if (undoDisabledAfterOpen !== true) {
    throw new Error('Open Project must reset prior project history; Undo was unexpectedly enabled.');
  }

  await setLabelInput('Registration clearance / side', 0.40);
  await waitFor('post-open calibration edit', async () => Number(await inputValue('Registration clearance / side')) === 0.4);
  await clickButton('Undo');
  await waitFor('post-open calibration undo', async () => Number(await inputValue('Registration clearance / side')) === 0.3);
  await clickButton('Redo');
  await waitFor('post-open calibration redo', async () => Number(await inputValue('Registration clearance / side')) === 0.4);
  await setLabelInput('Registration clearance / side', 0.30);
  await waitFor('recovery target calibration', async () => Number(await inputValue('Registration clearance / side')) === 0.3);

  await delay(1800);
  await refresh();
  await waitText('CAD_CAM_3D');
  await waitText('Recover');
  await clickButton('Recover');
  await waitFor('recovered calibration', async () => Number(await inputValue('Registration clearance / side')) === 0.3);
  await waitFor('recovered width', async () => Number(await inputValue('width')) === 300);

  const swReady = await executeAsync(
    "const done=arguments[arguments.length-1]; if(!('serviceWorker' in navigator)){done(false);return;} navigator.serviceWorker.ready.then(()=>done(true)).catch(()=>done(false));",
  );
  if (!swReady) throw new Error('Production service worker did not become ready.');
  await refresh();
  await waitText('CAD_CAM_3D');

  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none',
  });
  await refresh();
  await waitText('CAD_CAM_3D', true, 20000);
  await cdp('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: 'wifi',
  });

  const sortedDurations = navigationSamples
    .map((entry) => entry.duration)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const percentile = (p) => {
    if (sortedDurations.length === 0) return null;
    return sortedDurations[Math.min(sortedDurations.length - 1, Math.ceil(sortedDurations.length * p) - 1)];
  };
  const p50 = percentile(0.5);
  const p95 = percentile(0.95);

  // Ratified after the first successful CI measurement on 2026-10-08:
  // p95 navigation 357.8ms, STEP 992ms, aligned split 885ms.
  // These are regression guards with substantial CI variance headroom,
  // not end-user latency SLAs.
  const browserBudget = {
    navigationP95Ms: 1500,
    stepMs: 10000,
    alignedSplitMs: 15000,
  };
  if (p95 !== null && p95 > browserBudget.navigationP95Ms) {
    throw new Error(`Browser navigation p95 ${p95.toFixed(1)}ms exceeds v1 CI budget ${browserBudget.navigationP95Ms}ms.`);
  }
  if (stepDurationMs > browserBudget.stepMs) {
    throw new Error(`STEP export ${stepDurationMs.toFixed(0)}ms exceeds v1 CI budget ${browserBudget.stepMs}ms.`);
  }
  if (alignedDurationMs > browserBudget.alignedSplitMs) {
    throw new Error(`Aligned split export ${alignedDurationMs.toFixed(0)}ms exceeds v1 CI budget ${browserBudget.alignedSplitMs}ms.`);
  }

  console.log(
    'Browser critical journey PASS'
      + ` | URL=${appUrl}`
      + ` | navigation samples=${sortedDurations.length}`
      + ` | p50=${p50 === null ? 'n/a' : p50.toFixed(1) + 'ms'}`
      + ` | p95=${p95 === null ? 'n/a' : p95.toFixed(1) + 'ms'}`
      + ` | step=${stepDurationMs.toFixed(0)}ms`
      + ` | aligned=${alignedDurationMs.toFixed(0)}ms`
      + ' | calibration/reanalysis/aligned-3MF/STEP/save-open/history-reset/undo-redo/recovery/offline PASS',
  );
} catch (error) {
  throw new Error(String(error) + previewOutput() + driverOutput());
} finally {
  if (sessionId) {
    try { await jsonRequest(driverUrl + '/session/' + sessionId, { method: 'DELETE' }); } catch {}
  }
  for (const child of [preview, driver]) {
    try { child.kill('SIGTERM'); } catch {}
    child.stdout?.destroy();
    child.stderr?.destroy();
  }
  if (downloadDir) {
    try { await rm(downloadDir, { recursive: true, force: true }); } catch {}
  }
}
