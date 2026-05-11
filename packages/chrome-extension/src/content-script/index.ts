/**
 * Content script — runs in every http(s) tab at `document_idle`.
 *
 * Hosts two modes:
 *   - Audit: on `audit:request`, run axe-core and return raw AxeResults.
 *   - Recorder: between `recorder:start` and `recorder:stop`, capture DOM
 *     events into a module-scope buffer; return the buffer on stop.
 *
 * v0.4.1 recorder scope:
 *   - Captures `click` events only (input/change/submit/keydown land in v0.4.2).
 *   - Selectors are basic CSS (`tag#id.class`) — hardened selectors land in v0.4.3.
 *   - No state persistence across page navigations or popup close (v0.4.5).
 */
import axe from 'axe-core';
import type { RecordedEvent } from '@webspec/core/browser';
import {
  isAuditRequest,
  isRecorderStartRequest,
  isRecorderStopRequest,
  type AuditResponse,
  type RecorderStartResponse,
  type RecorderStopResponse,
} from '../shared/messages.js';
import { buildBasicSelector } from './selectors.js';

/** Mirror of `DEFAULT_A11Y_TAGS` in `@webspec/core` — see audit-mode rationale. */
const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508'];

console.log('[webspec] content script loaded:', location.href);

// ---------------------------------------------------------------------------
// Recorder state — module-scope. Lives only while the tab + content script
// stays alive; v0.4.5 will move this to chrome.storage.session for survival.
// ---------------------------------------------------------------------------

let recorderActive = false;
let recordedEvents: RecordedEvent[] = [];
let recorderStartTime = 0;

function handleClick(ev: MouseEvent): void {
  if (!recorderActive) return;
  const target = ev.target;
  if (!(target instanceof Element)) return;

  const selector = buildBasicSelector(target);
  recordedEvents.push({
    t: performance.now() - recorderStartTime,
    kind: 'click',
    selector: { preferred: selector, strategy: 'css', fallbacks: [] },
    ...(target.textContent ? { targetText: target.textContent.trim().slice(0, 80) } : {}),
  });
}

function startRecorder(): RecorderStartResponse {
  if (recorderActive) {
    return { ok: false, error: 'Recorder already running in this tab.' };
  }
  recordedEvents = [];
  recorderStartTime = performance.now();
  recorderActive = true;
  document.addEventListener('click', handleClick, { capture: true });
  return { ok: true, startedAt: new Date().toISOString(), startUrl: location.href };
}

function stopRecorder(): RecorderStopResponse {
  if (!recorderActive) {
    return { ok: false, error: 'Recorder is not running. Click Record first.' };
  }
  recorderActive = false;
  document.removeEventListener('click', handleClick, { capture: true });
  const events = recordedEvents;
  recordedEvents = [];
  return { ok: true, endedAt: new Date().toISOString(), events };
}

// ---------------------------------------------------------------------------
// Audit (unchanged from v0.3.8).
// ---------------------------------------------------------------------------

async function runAudit(): Promise<AuditResponse> {
  try {
    const results = await axe.run(document, { runOnly: { type: 'tag', values: A11Y_TAGS } });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Message router — single listener dispatches based on `type`.
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isAuditRequest(message)) {
    void runAudit().then(sendResponse);
    return true; // async response
  }

  if (isRecorderStartRequest(message)) {
    sendResponse(startRecorder());
    return false;
  }

  if (isRecorderStopRequest(message)) {
    sendResponse(stopRecorder());
    return false;
  }

  return false;
});
