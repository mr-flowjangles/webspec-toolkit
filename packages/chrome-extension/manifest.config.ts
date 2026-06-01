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
    // v1.7.9 — the popup is retired. Clicking the toolbar icon opens the side
    // panel (the service worker's `setPanelBehavior({ openPanelOnActionClick:
    // true })`), which is now the single surface for every view — Audit,
    // Record, Save, Settings, and Queues. No `default_popup`.
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
  // v1.7.6 — without explicit host_permissions, `chrome.tabs.query` only
  // returns `tab.url` for tabs the user has invoked the extension on (the
  // `activeTab` grant). In the side panel, that means a tab the user
  // *switched to* but hasn't re-clicked the icon on returns `tab.url ===
  // undefined`, which our `activeHttpTab()` check treats as "not an
  // http(s) page" — surfacing the false-positive error Rob hit live. We
  // declare http/https host access so the side panel can correctly
  // identify the active tab without depending on a per-tab grant.
  host_permissions: ['http://*/*', 'https://*/*'],
  web_accessible_resources: [
    {
      resources: ['src/report/index.html', 'src/settings/index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
