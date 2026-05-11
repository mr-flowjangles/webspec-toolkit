/**
 * Content script — v0.3.7 scaffold.
 *
 * Lives at `document_idle` in every http(s) page. Future PRs:
 *   - audit mode: inject `axe-core/browser`, run on demand from the popup,
 *     normalize the result via `@webspec/core/browser` → A11yReport.
 *   - recorder mode: capture clicks/inputs/etc. with hardened selectors,
 *     stream events to the service worker for export.
 *
 * For now it just logs a load marker so we can verify in the live smoke
 * that the content script actually registered against the active tab.
 */
console.log('[webspec] content script loaded:', location.href);
