import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(dist, 'offline-assets.json'), 'utf8'));
if (!manifest || !Array.isArray(manifest.assets)) {
  throw new Error('Release build audit requires offline-assets.json.');
}

const rows = [];
for (const relative of manifest.assets) {
  const info = await stat(resolve(dist, relative));
  rows.push({ file: relative, bytes: info.size });
}
rows.sort((a, b) => b.bytes - a.bytes);

const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
const jsBytes = rows.filter((row) => row.file.endsWith('.js')).reduce((sum, row) => sum + row.bytes, 0);
const cssBytes = rows.filter((row) => row.file.endsWith('.css')).reduce((sum, row) => sum + row.bytes, 0);
const wasmBytes = rows.filter((row) => row.file.endsWith('.wasm')).reduce((sum, row) => sum + row.bytes, 0);

const MIB = 1024 * 1024;
// Ratified from measured CI baseline on 2026-10-08:
// total 22.148 MiB, JS 0.937 MiB, CSS 0.015 MiB, exact WASM 21.197 MiB.
// These are regression budgets with headroom, not download-speed SLAs.
const budget = {
  totalBytes: 28 * MIB,
  jsBytes: 1.25 * MIB,
  cssBytes: 0.10 * MIB,
  wasmBytes: 24 * MIB,
};
for (const [label, actual, maximum] of [
  ['total assets', totalBytes, budget.totalBytes],
  ['JavaScript', jsBytes, budget.jsBytes],
  ['CSS', cssBytes, budget.cssBytes],
  ['exact WASM', wasmBytes, budget.wasmBytes],
]) {
  if (actual > maximum) {
    throw new Error(
      label + ' release size ' + (actual / MIB).toFixed(3)
      + ' MiB exceeds v1 regression budget ' + (maximum / MIB).toFixed(3) + ' MiB.',
    );
  }
}

const html = await readFile(resolve(dist, 'index.html'), 'utf8');
if (!html.includes('Content-Security-Policy')) {
  throw new Error('Production index.html is missing the required Content-Security-Policy meta.');
}
if (!html.includes('name="referrer" content="no-referrer"')) {
  throw new Error('Production index.html is missing the no-referrer policy.');
}
if (/https?:\/\//i.test(html)) {
  throw new Error('Production index.html unexpectedly references an external HTTP(S) origin.');
}

const mib = (bytes) => (bytes / (1024 * 1024)).toFixed(3);
console.log(
  'Release build baseline | total=' + mib(totalBytes) + ' MiB'
  + ' | js=' + mib(jsBytes) + ' MiB'
  + ' | css=' + mib(cssBytes) + ' MiB'
  + ' | wasm=' + mib(wasmBytes) + ' MiB',
);
for (const row of rows.slice(0, 8)) {
  console.log('  ' + row.file + ' = ' + mib(row.bytes) + ' MiB');
}
