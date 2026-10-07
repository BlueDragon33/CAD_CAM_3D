import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function offlineAssetManifest(): Plugin {
  return {
    name: 'cad-cam-3d-offline-asset-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((fileName) => !fileName.endsWith('.map'))
        .sort();
      this.emitFile({
        type: 'asset',
        fileName: 'offline-assets.json',
        source: JSON.stringify({ assets }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineAssetManifest()],
  server: { port: 5173 },
  optimizeDeps: {
    // occt-wasm ships its own Emscripten glue + WASM asset. Pre-bundling it
    // breaks the runtime locator in some browser/dev-server configurations.
    exclude: ['occt-wasm'],
  },
  build: {
    // occt-wasm targets modern WASM capabilities; keep Vite from transpiling
    // the dynamically loaded kernel chunk down to an older JS target.
    target: 'esnext',
  },
});
