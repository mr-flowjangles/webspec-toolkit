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
 *
 * v0.5.3 scope:
 *   - Navigation event capture via `chrome.webNavigation`. Three listeners
 *     cover the four navigation kinds: onCommitted (cross-doc + reload),
 *     onHistoryStateUpdated (pushState/replaceState), onReferenceFragmentUpdated
 *     (hash). For same-document navigations we message the content script,
 *     which appends the event to its in-memory buffer and persists. For
 *     cross-document navigations the content script is being torn down — we
 *     write the event directly to storage, since the new content script's
 *     bootstrap will pick it up.
 *
 * Future PRs (deferred from v1 path):
 *   - Network capture (`chrome.webRequest`) — v0.5.x or M6-enables.
 */
import type { RecordedEvent } from '@webspec/core/browser';
import {
  isRecorderSessionClearRequest,
  isRecorderSessionGetRequest,
  isRecorderSessionPutRequest,
  type RecorderAppendEventRequest,
  type RecorderAppendEventResponse,
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

// ---------------------------------------------------------------------------
// Navigation capture (v0.5.3)
// ---------------------------------------------------------------------------

type NavReason = 'navigate' | 'reload' | 'history' | 'hash';

/**
 * Handle a webNavigation event for an active recording. Same-document
 * navigations go via a message to the still-alive content script (so the
 * event lands in the in-memory buffer immediately). Cross-document
 * navigations write directly to storage, because the old content script is
 * being destroyed and the new one will read storage on bootstrap.
 *
 * Top frames only — subframe navigations are noise for a workflow recording.
 */
async function handleNavigation(
  details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
  baseReason: Exclude<NavReason, 'reload'>,
): Promise<void> {
  if (details.frameId !== 0) return;
  const tabId = details.tabId;
  if (tabId === undefined || tabId < 0) return;

  const state = await getSession(tabId);
  if (state === null) return; // no recording for this tab — drop silently

  // onCommitted fires for both fresh loads and reloads. Distinguish them by
  // transitionType so renderers can emit `page.reload()` vs `goto(url)`.
  const isReload =
    baseReason === 'navigate' &&
    'transitionType' in details &&
    details.transitionType === 'reload';
  const reason: NavReason = isReload ? 'reload' : baseReason;

  const event: RecordedEvent = {
    t: Date.now() - state.startedAtMs,
    kind: 'navigate',
    url: details.url,
    reason,
  };

  if (baseReason === 'navigate') {
    // Cross-document: content script is dying. Write directly so the new
    // content script's bootstrap reads the nav event from storage.
    state.events.push(event);
    await putSession(tabId, state);
    return;
  }

  // Same-document: tell the live content script. It owns the buffer and will
  // persist after appending. Fall back to a direct storage write if the tab
  // doesn't respond (rare — content script crashed / not yet injected).
  try {
    const request: RecorderAppendEventRequest = { type: 'recorder:append-event', event };
    const response = await chrome.tabs.sendMessage<
      RecorderAppendEventRequest,
      RecorderAppendEventResponse
    >(tabId, request);
    if (response.ok && response.absorbed) return;
  } catch {
    // Receiver gone or messaging blocked — fall through to direct write.
  }
  state.events.push(event);
  await putSession(tabId, state);
}

chrome.webNavigation.onCommitted.addListener((details) => {
  void handleNavigation(details, 'navigate');
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void handleNavigation(details, 'history');
});

chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  void handleNavigation(details, 'hash');
});
