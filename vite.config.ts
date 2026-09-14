import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
