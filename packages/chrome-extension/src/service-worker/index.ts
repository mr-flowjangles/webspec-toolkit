/**
 * Background service worker — v0.3.7 scaffold.
 *
 * Manifest V3 service workers are ephemeral; we wake on events and don't
 * hold long-lived state in module scope. Future PRs:
 *   - `chrome.webRequest` listener to capture outgoing network requests
 *     during recording (URL + method only — no response bodies in v1).
 *   - message bus between popup ↔ content script for audit + record flows.
 *
 * For now we just log install / activation so the live smoke confirms the
 * worker registered.
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[webspec] service worker installed:', details.reason);
});
