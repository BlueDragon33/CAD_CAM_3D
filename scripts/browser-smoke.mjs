import { spawn } from 'node:child_process';

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
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
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
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'preview', '--', '--host', host, '--port', String(port)],
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

  await clickButton('Export Aligned Split 3MF');
  await waitOperationResult(
    'Aligned Split 3MF PASS',
    ['Aligned Split 3MF blocked:', 'Aligned Split 3MF failed.'],
    60000,
  );

  await clickButton('Export STEP');
  await waitOperationResult(
    'STEP export PASS',
    ['STEP export blocked:', 'STEP export failed.'],
    60000,
  );

  await clickButton('Undo');
  await waitFor('calibration undo', async () => (await inputValue('Registration clearance / side')) === '');
  await clickButton('Redo');
  await waitFor('calibration redo', async () => Number(await inputValue('Registration clearance / side')) === 0.3);

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

  console.log(
    'Browser critical journey PASS'
      + ` | URL=${appUrl}`
      + ` | navigation samples=${sortedDurations.length}`
      + ` | p50=${p50 === null ? 'n/a' : p50.toFixed(1) + 'ms'}`
      + ` | p95=${p95 === null ? 'n/a' : p95.toFixed(1) + 'ms'}`
      + ' | calibration/reanalysis/aligned-3MF/STEP/undo-redo/recovery/offline PASS',
  );
} catch (error) {
  throw new Error(String(error) + previewOutput() + driverOutput());
} finally {
  if (sessionId) {
    try { await jsonRequest(driverUrl + '/session/' + sessionId, { method: 'DELETE' }); } catch {}
  }
  preview.kill('SIGTERM');
  driver.kill('SIGTERM');
}
