/* CAD_CAM_3D local-first production cache.
 * This worker caches only same-origin application assets. User CAD project data
 * is not stored here and remains governed by explicit project persistence.
 */
const CACHE_NAME = 'cad-cam-3d-offline';
const scopeRoot = new URL('./', self.registration.scope).toString();
const manifestUrl = new URL('offline-assets.json', scopeRoot).toString();

async function loadManifest() {
  const response = await fetch(manifestUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Offline asset manifest unavailable.');
  const value = await response.json();
  if (!value || !Array.isArray(value.assets)) throw new Error('Offline asset manifest is invalid.');
  return value.assets.filter((entry) => typeof entry === 'string' && entry.length > 0);
}

async function cacheProductionShell() {
  const assets = await loadManifest();
  const urls = [
    scopeRoot,
    manifestUrl,
    ...assets.map((asset) => new URL(asset, scopeRoot).toString()),
  ];
  const cache = await caches.open(CACHE_NAME);

  // Fetch one by one so a failure identifies the exact artifact and prevents a
  // falsely "installed" offline shell missing the exact-kernel WASM.
  for (const url of urls) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline asset fetch failed: ' + url);
    await cache.put(url, response);
  }

  const desired = new Set(urls);
  const existing = await cache.keys();
  await Promise.all(existing.map((request) => {
    const url = new URL(request.url);
    const isHashedAsset = url.origin === self.location.origin && url.pathname.includes('/assets/');
    if (isHashedAsset && !desired.has(request.url)) return cache.delete(request);
    return Promise.resolve(false);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheProductionShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(scopeRoot, response.clone());
      return response;
    }
  } catch {
    // Offline fallback below.
  }
  return (await cache.match(request)) || (await cache.match(scopeRoot)) || Response.error();
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(cacheFirstStatic(request));
});
