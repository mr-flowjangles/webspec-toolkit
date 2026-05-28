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
    // v1.7.1 — `default_popup` stays declared so the popup HTML continues
    // to auto-discover as a vite build entry and Chrome treats it as a
    // valid action surface. At runtime the service worker calls
    // `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`,
    // which makes the side panel win on icon-click. The popup remains
    // available programmatically until v1.7.3 retires it fully.
    default_popup: 'src/popup/index.html',
    default_title: 'webspec',
  },
  // v1.7.1 — Chrome 114+ Side Panel API surfaces the same React app the
  // popup did. Clicking the toolbar icon opens the side panel; see the
  // setPanelBehavior call in the service worker.
  side_panel: {
    default_path: 'src/sidepanel/index.html',
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
  permissions: ['activeTab', 'storage', 'downloads', 'webNavigation', 'sidePanel'],
  web_accessible_resources: [
    {
      resources: ['src/report/index.html', 'src/settings/index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
