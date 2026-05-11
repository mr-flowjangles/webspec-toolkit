/**
 * Background service worker.
 *
 * Manifest V3 service workers are ephemeral; we wake on events and don't hold
 * long-lived state in module scope. Persistent state across wakeups lives in
 * `chrome.storage.session` (in-memory, per browser session).
 *
 * v0.5.2 scope:
 *   - Broker for `chrome.storage.session` recorder state. Content scripts
 *     ask the service worker to get/put/clear their tab's recording snapshot
 *     because content scripts can't see their own `tab.id` — `sender.tab.id`
 *     is only available to the service worker.
 *   - One storage key per tab: `webspec:recorder:<tabId>`. Cleared on stop or
 *     on tab close (chrome.tabs.onRemoved).
 *   - Future PRs (deferred from v1 path):
 *     - Navigation event capture (`chrome.webNavigation`) — v0.5.3.
 *     - Network capture (`chrome.webRequest`) — v0.5.x or M6-enables.
 */
import {
  isRecorderSessionClearRequest,
  isRecorderSessionGetRequest,
  isRecorderSessionPutRequest,
  type RecorderSessionClearResponse,
  type RecorderSessionGetResponse,
  type RecorderSessionPutResponse,
  type RecorderSessionState,
} from '../shared/messages.js';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[webspec] service worker installed:', details.reason);
});

// ---------------------------------------------------------------------------
// Recorder session broker
// ---------------------------------------------------------------------------

function sessionKey(tabId: number): string {
  return `webspec:recorder:${tabId}`;
}

async function getSession(tabId: number): Promise<RecorderSessionState | null> {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const value = stored[key];
  return (value as RecorderSessionState | undefined) ?? null;
}

async function putSession(tabId: number, state: RecorderSessionState): Promise<void> {
  await chrome.storage.session.set({ [sessionKey(tabId)]: state });
}

async function clearSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove(sessionKey(tabId));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // All recorder:session:* messages must come from a content script in a
  // real tab. If sender.tab.id is missing (popup, options page, etc.), the
  // protocol doesn't apply — reject with a typed error rather than guess.
  const tabId = sender.tab?.id;

  if (isRecorderSessionGetRequest(message)) {
    if (tabId === undefined) {
      const response: RecorderSessionGetResponse = {
        ok: false,
        error: 'recorder:session:get must be sent from a tab content script.',
      };
      sendResponse(response);
      return false;
    }
    void getSession(tabId)
      .then((state) => {
        const response: RecorderSessionGetResponse = { ok: true, state };
        sendResponse(response);
      })
      .catch((err: unknown) => {
        const response: RecorderSessionGetResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isRecorderSessionPutRequest(message)) {
    if (tabId === undefined) {
      const response: RecorderSessionPutResponse = {
        ok: false,
        error: 'recorder:session:put must be sent from a tab content script.',
      };
      sendResponse(response);
      return false;
    }
    void putSession(tabId, message.state)
      .then(() => sendResponse({ ok: true } satisfies RecorderSessionPutResponse))
      .catch((err: unknown) => {
        const response: RecorderSessionPutResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      });
    return true;
  }

  if (isRecorderSessionClearRequest(message)) {
    if (tabId === undefined) {
      const response: RecorderSessionClearResponse = {
        ok: false,
        error: 'recorder:session:clear must be sent from a tab content script.',
      };
      sendResponse(response);
      return false;
    }
    void clearSession(tabId)
      .then(() => sendResponse({ ok: true } satisfies RecorderSessionClearResponse))
      .catch((err: unknown) => {
        const response: RecorderSessionClearResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      });
    return true;
  }

  return false;
});

// Drop the session snapshot when the tab closes — no point keeping stale
// state around, and Chrome doesn't garbage-collect storage.session for us.
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearSession(tabId);
});
