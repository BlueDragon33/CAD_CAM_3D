import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const manifestPath = resolve(dist, 'offline-assets.json');
const swPath = resolve(dist, 'sw.js');

await access(swPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest || !Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  throw new Error('offline-assets.json must contain production assets.');
}

const required = {
  javascript: manifest.assets.some((entry) => entry.endsWith('.js')),
  stylesheet: manifest.assets.some((entry) => entry.endsWith('.css')),
  exactWasm: manifest.assets.some((entry) => entry.endsWith('.wasm')),
};

for (const [label, present] of Object.entries(required)) {
  if (!present) throw new Error('Offline manifest is missing required ' + label + ' asset.');
}

for (const relative of manifest.assets) {
  await access(resolve(dist, relative));
}

console.log(
  'Offline build smoke PASS | '
    + manifest.assets.length
    + ' assets | JS/CSS/exact-WASM present | service worker present',
);
