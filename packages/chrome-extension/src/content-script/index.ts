/**
 * Content script — runs axe-core on demand against the current page.
 *
 * Bundled into every http(s) tab at `document_idle` (see `manifest.config.ts`).
 * Listens for `audit:request` messages from the popup, runs axe with the v1
 * tag set, and returns the raw `AxeResults`. Normalization to `A11yReport`
 * happens in the popup so this script stays minimal.
 *
 * The popup, not the service worker, sends the message — popup ↔ content
 * script is a direct `chrome.tabs.sendMessage` round trip via the same
 * `chrome.runtime.onMessage` listener.
 */
import axe from 'axe-core';
import { isAuditRequest, type AuditResponse } from '../shared/messages.js';

/** Mirror of `DEFAULT_A11Y_TAGS` in `@webspec/core`. Kept duplicated here so
 *  the content-script bundle doesn't need to import the whole core surface
 *  for a single constant; if it drifts, the renderer's header line will
 *  reveal the gap. */
const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508'];

console.log('[webspec] content script loaded:', location.href);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isAuditRequest(message)) return false;

  void runAudit().then(sendResponse);
  // Returning `true` tells Chrome we'll call sendResponse asynchronously —
  // axe.run is a promise and we want the channel to stay open.
  return true;
});

async function runAudit(): Promise<AuditResponse> {
  try {
    const results = await axe.run(document, { runOnly: { type: 'tag', values: A11Y_TAGS } });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
