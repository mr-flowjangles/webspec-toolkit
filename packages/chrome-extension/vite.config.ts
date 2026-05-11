import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // The popup, service worker, and content script are auto-discovered
      // by @crxjs/vite-plugin from the manifest. The report tab HTML is
      // listed in `web_accessible_resources` only — that doesn't mark it
      // as a build entry, so we add it here so its main.tsx gets bundled.
      input: {
        report: resolve(here, 'src/report/index.html'),
      },
    },
  },
});
