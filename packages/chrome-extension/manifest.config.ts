/**
 * Manifest V3 definition for the webspec Chrome extension.
 *
 * Consumed at build time by `@crxjs/vite-plugin` (see `vite.config.ts`),
 * which emits the final `manifest.json` into the build output. Writing it
 * as TypeScript lets us reference entry-point paths symbolically and pull
 * the version from package.json.
 */
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'webspec',
  version: pkg.version,
  description: 'Browser-based shift-left companion: WCAG/508 audit + workflow recorder for web apps.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'webspec',
  },
  background: {
    service_worker: 'src/service-worker/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content-script/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'storage', 'downloads'],
  web_accessible_resources: [
    {
      resources: ['src/report/index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
