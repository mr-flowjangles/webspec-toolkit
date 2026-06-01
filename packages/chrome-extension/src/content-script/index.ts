/**
 * Content script — runs in every http(s) tab at `document_idle`.
 *
 * Hosts two modes:
 *   - Audit: on `audit:request`, run axe-core and return raw AxeResults.
 *   - Recorder: between `recorder:start` and `recorder:stop`, capture DOM
 *     events into a module-scope buffer; return the buffer on stop.
 *
 * v0.5.2 recorder scope:
 *   - Captures `click`, `input`, `change`, `submit`, `keydown` events.
 *   - `<input type="password">` is masked: value not captured, sensitive=true.
 *   - `keydown` only captures "significant" keys (Enter/Tab/Escape/Arrows/
 *     PageUp-Down/Home/End). Character typing flows through `input` instead.
 *   - Contiguous `input` events on the same field are coalesced into one
 *     event holding the final value — one sentence, not one event per key.
 *   - A focusing `click` immediately followed by an `input` on the same
 *     field is dropped — `fill()` focuses on its own.
 *   - A checkbox/radio click fires both `click` and `change`; the preceding
 *     `click` is dropped so one user action yields one event. Same rule
 *     applies to `<select>` — `selectOption()` covers both. `<select>` also
 *     emits a *trailing* click (the option click bubbles after the change
 *     fires), which is dropped on the way in.
 *   - Selectors are hardened at capture time (`data-testid` > role+name >
 *     text > css). See `selectors.ts`.
 *   - State persists across page reloads: on each event we push the recording
 *     snapshot to the service worker, which keeps it in `chrome.storage.session`
 *     keyed by tab id. On (re)load, we read it back and resume recording. Event
 *     timestamps are wall-clock-relative so they survive the reset of
 *     `performance.now()` that comes with a fresh document.
 */
import axe from 'axe-core';
import type { RecordedEvent } from '@webspec/core/browser';
import {
  isAuditRequest,
  isRecorderAppendEventRequest,
  isRecorderStartRequest,
  isRecorderStatusRequest,
  isRecorderStopRequest,
  type AuditResponse,
  type RecorderAppendEventResponse,
  type RecorderSessionClearRequest,
  type RecorderSessionClearResponse,
  type RecorderSessionGetRequest,
  type RecorderSessionGetResponse,
  type RecorderSessionPutRequest,
  type RecorderSessionPutResponse,
  type RecorderSessionState,
  type RecorderStartRequest,
  type RecorderStartResponse,
  type RecorderStatusResponse,
  type RecorderStopResponse,
} from '../shared/messages.js';
import { buildHardenedSelector } from './selectors.js';
import type { HardenedSelector } from '@webspec/core/browser';
import {
  OVERLAY_HOST_ATTR,
  mountRecorderOverlay,
  syncRecorderOverlay,
  unmountRecorderOverlay,
} from './overlay.js';
import type { RecorderOverlayStopRequest } from '../shared/messages.js';

/** Mirror of `DEFAULT_A11Y_TAGS` in `@webspec/core` — see audit-mode rationale. */
const A11Y_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'section508',
  'best-practice',
];

/**
 * Keys we treat as workflow-significant on `keydown`. Plain character typing
 * is captured via `input` events; capturing it twice would bloat recordings.
 */
const SIGNIFICANT_KEYS = new Set([
  'Enter',
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

console.log('[webspec] content script loaded:', location.href);

// ---------------------------------------------------------------------------
// Recorder state — module-scope, but mirrored to `chrome.storage.session` via
// the service worker so it survives a content-script restart (page reload,
// in-page navigation that re-runs the document). Timestamps are wall-clock
// relative to `recorderStartMs` so they remain coherent across that restart;
// `performance.now()` resets to 0 on a new document and is unsafe here.
// ---------------------------------------------------------------------------

let recorderActive = false;
let recordedEvents: RecordedEvent[] = [];
let recorderStartMs = 0;
let recorderStartedAtIso: string | null = null;
let recorderStartUrl: string | null = null;
let recorderName: string | null = null;
let recorderDescription: string | null = null;
let recorderRunAs: string | null = null;

function timestamp(): number {
  return Date.now() - recorderStartMs;
}

function selectorFor(target: Element): HardenedSelector {
  return buildHardenedSelector(target);
}

/**
 * The overlay is rendered inside a Shadow DOM host appended to this same
 * document, so clicks/drags on it bubble to our capture listeners with the
 * event retargeted to the host element. Ignore those so the recorder doesn't
 * capture the user operating the overlay (the Stop button, dragging, etc.).
 */
function isOverlayEvent(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${OVERLAY_HOST_ATTR}]`) !== null;
}

/**
 * Push the current recording snapshot to the service worker, which writes it
 * to `chrome.storage.session` keyed by this tab's id. Fire-and-forget: a
 * later event will overwrite the snapshot, so a dropped persist is recovered
 * automatically; awaiting it in an event handler would just slow capture.
 */
function persistSession(): void {
  if (
    !recorderActive ||
    recorderStartedAtIso === null ||
    recorderStartUrl === null ||
    recorderName === null ||
    recorderDescription === null ||
    recorderRunAs === null
  ) {
    return;
  }
  const state: RecorderSessionState = {
    startedAtIso: recorderStartedAtIso,
    startUrl: recorderStartUrl,
    startedAtMs: recorderStartMs,
    name: recorderName,
    description: recorderDescription,
    runAs: recorderRunAs,
    events: recordedEvents,
  };
  const request: RecorderSessionPutRequest = { type: 'recorder:session:put', state };
  void chrome.runtime.sendMessage<RecorderSessionPutRequest, RecorderSessionPutResponse>(request);
  // Keep the floating overlay's live feed in step with the buffer. This is the
  // single chokepoint every event push (DOM + navigate) flows through, so the
  // feed stays current without sprinkling sync calls across each handler.
  syncRecorderOverlay(recordedEvents);
}

/**
 * The overlay's Stop button broadcasts this fire-and-forget message; the side
 * panel runs its stop→review flow in response. We deliberately don't stop the
 * recorder here — keeping a single stop path (via `recorder:stop`) means the
 * WorkflowRecording is always built in one place.
 */
function requestOverlayStop(): void {
  const request: RecorderOverlayStopRequest = { type: 'recorder:overlay-stop' };
  void chrome.runtime.sendMessage(request);
}

function addRecorderListeners(): void {
  document.addEventListener('click', handleClick, { capture: true });
  document.addEventListener('input', handleInput, { capture: true });
  document.addEventListener('change', handleChange, { capture: true });
  document.addEventListener('submit', handleSubmit, { capture: true });
  document.addEventListener('keydown', handleKeydown, { capture: true });
}

function removeRecorderListeners(): void {
  document.removeEventListener('click', handleClick, { capture: true });
  document.removeEventListener('input', handleInput, { capture: true });
  document.removeEventListener('change', handleChange, { capture: true });
  document.removeEventListener('submit', handleSubmit, { capture: true });
  document.removeEventListener('keydown', handleKeydown, { capture: true });
}

function handleClick(ev: MouseEvent): void {
  if (!recorderActive) return;
  if (isOverlayEvent(ev.target)) return;
  const target = ev.target;
  if (!(target instanceof Element)) return;

  const selector = selectorFor(target);

  // A `<select>` fires its `change` event before the `click` finishes
  // bubbling up from the chosen option, so the click arrives *after* the
  // change. Same physical action, two events — drop the trailing click.
  if (target instanceof HTMLSelectElement) {
    const last = recordedEvents[recordedEvents.length - 1];
    if (last && last.kind === 'change' && last.selector.preferred === selector.preferred) {
      return;
    }
  }

  recordedEvents.push({
    t: timestamp(),
    kind: 'click',
    selector,
    ...(target.textContent ? { targetText: target.textContent.trim().slice(0, 80) } : {}),
  });
  persistSession();
}

function handleInput(ev: Event): void {
  if (!recorderActive) return;
  if (isOverlayEvent(ev.target)) return;
  const target = ev.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;

  // `change` events for select/checkbox/radio are routed through handleChange;
  // skip them here to avoid double-capture (input also fires on some selects).
  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
    return;
  }

  const sensitive = target instanceof HTMLInputElement && target.type === 'password';
  const selector = selectorFor(target);
  const value = sensitive ? '' : target.value;

  // Coalesce contiguous keystrokes in the same field into a single event:
  // the user sees one sentence typed, the renderer emits one fill(). Any
  // intervening event (Enter, Tab, click elsewhere) breaks the run.
  const last = recordedEvents[recordedEvents.length - 1];
  if (last && last.kind === 'input' && last.selector.preferred === selector.preferred) {
    last.t = timestamp();
    last.value = value;
    last.sensitive = sensitive;
    persistSession();
    return;
  }
  // A click that just focused this field is redundant once typing follows —
  // Playwright's fill() focuses on its own. Drop it so the recording is a
  // single input event, not click-then-input.
  if (last && last.kind === 'click' && last.selector.preferred === selector.preferred) {
    recordedEvents.pop();
  }

  recordedEvents.push({
    t: timestamp(),
    kind: 'input',
    selector,
    value,
    sensitive,
  });
  persistSession();
}

function handleChange(ev: Event): void {
  if (!recorderActive) return;
  if (isOverlayEvent(ev.target)) return;
  const target = ev.target;
  if (target instanceof HTMLInputElement) {
    // For checkbox/radio, the meaningful value is checked state, surfaced as
    // 'true' | 'false'. For everything else `input` already captured it.
    if (target.type === 'checkbox' || target.type === 'radio') {
      const selector = selectorFor(target);
      // A checkbox/radio click fires both `click` and `change` on the same
      // element within milliseconds — same physical action, two events. The
      // `change` carries the new state, so drop the preceding `click`.
      const last = recordedEvents[recordedEvents.length - 1];
      if (last && last.kind === 'click' && last.selector.preferred === selector.preferred) {
        recordedEvents.pop();
      }
      recordedEvents.push({
        t: timestamp(),
        kind: 'change',
        selector,
        value: String(target.checked),
      });
      persistSession();
    }
    return;
  }
  if (target instanceof HTMLSelectElement) {
    const selector = selectorFor(target);
    // Same dedup logic as checkbox/radio: a click that opened the dropdown
    // is redundant once the change fires — `page.selectOption()` does both.
    const last = recordedEvents[recordedEvents.length - 1];
    if (last && last.kind === 'click' && last.selector.preferred === selector.preferred) {
      recordedEvents.pop();
    }
    recordedEvents.push({
      t: timestamp(),
      kind: 'change',
      selector,
      value: target.value,
      options: optionsFor(target),
    });
    persistSession();
  }
}

/**
 * Capture the option set on a `<select>` at the moment of change. Renderers
 * use this to choose `selectByLabel` vs `selectByValue` and the M6 amplifier
 * uses it to generate negative scenarios from the unchosen options.
 *
 * Single-select only for v0.6.1 — `<select multiple>` is rare in shift-left
 * recordings and adds renderer surface (array of values) we'll handle later.
 * Optgroups are flattened; disabled options are still captured (they're part
 * of the visible UI even when unselectable).
 */
function optionsFor(select: HTMLSelectElement): { value: string; label: string }[] {
  return Array.from(select.options).map((opt) => ({
    value: opt.value,
    label: opt.textContent?.trim() ?? '',
  }));
}

function handleSubmit(ev: SubmitEvent): void {
  if (!recorderActive) return;
  if (isOverlayEvent(ev.target)) return;
  const target = ev.target;
  if (!(target instanceof HTMLFormElement)) return;

  recordedEvents.push({
    t: timestamp(),
    kind: 'submit',
    selector: selectorFor(target),
  });
  persistSession();
}

function handleKeydown(ev: KeyboardEvent): void {
  if (!recorderActive) return;
  if (isOverlayEvent(ev.target)) return;
  if (!SIGNIFICANT_KEYS.has(ev.key)) return;

  const target = ev.target;
  const selector = target instanceof Element ? selectorFor(target) : undefined;
  recordedEvents.push({
    t: timestamp(),
    kind: 'keydown',
    key: ev.key,
    ...(selector ? { selector } : {}),
  });
  persistSession();
}

function startRecorder(req: RecorderStartRequest): RecorderStartResponse {
  if (recorderActive) {
    return { ok: false, error: 'Recorder already running in this tab.' };
  }
  recordedEvents = [];
  recorderStartMs = Date.now();
  recorderStartedAtIso = new Date(recorderStartMs).toISOString();
  recorderStartUrl = location.href;
  recorderName = req.name;
  recorderDescription = req.description;
  recorderRunAs = req.runAs;
  recorderActive = true;
  addRecorderListeners();
  mountRecorderOverlay({ name: recorderName, onStop: requestOverlayStop });
  persistSession();
  return { ok: true, startedAt: recorderStartedAtIso, startUrl: recorderStartUrl };
}

function stopRecorder(): RecorderStopResponse {
  if (!recorderActive) {
    return { ok: false, error: 'Recorder is not running. Click Record first.' };
  }
  // Capture before clearing — the stop response needs to carry these back to
  // the popup so the WorkflowRecording it builds has the right metadata.
  const name = recorderName ?? '';
  const description = recorderDescription ?? '';
  const runAs = recorderRunAs ?? '';
  recorderActive = false;
  recorderStartedAtIso = null;
  recorderStartUrl = null;
  recorderName = null;
  recorderDescription = null;
  recorderRunAs = null;
  removeRecorderListeners();
  unmountRecorderOverlay();
  const events = recordedEvents;
  recordedEvents = [];
  const clearRequest: RecorderSessionClearRequest = { type: 'recorder:session:clear' };
  void chrome.runtime.sendMessage<RecorderSessionClearRequest, RecorderSessionClearResponse>(
    clearRequest,
  );
  return { ok: true, endedAt: new Date().toISOString(), name, description, runAs, events };
}

/**
 * On every content-script load, check whether the service worker has a
 * persisted recording for this tab. If so, restore in-memory state and
 * rebind event listeners so capture continues seamlessly. Resolves when
 * the bootstrap is complete; the message router awaits this before
 * answering popup queries to avoid a race where a status query lands
 * during the async restore.
 *
 * Retries: the service worker can be idle-terminated between reloads, and
 * Chrome occasionally drops the first message that arrives during cold
 * start. We retry up to three times with backoff before giving up.
 */
async function bootstrapRecorder(): Promise<void> {
  const request: RecorderSessionGetRequest = { type: 'recorder:session:get' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage<
        RecorderSessionGetRequest,
        RecorderSessionGetResponse
      >(request);
      if (!response.ok) {
        console.warn(`[webspec] bootstrap attempt ${attempt} returned error:`, response.error);
        await sleep(50 * attempt);
        continue;
      }
      if (response.state === null) return;
      const state = response.state;
      recordedEvents = state.events;
      recorderStartMs = state.startedAtMs;
      recorderStartedAtIso = state.startedAtIso;
      recorderStartUrl = state.startUrl;
      recorderName = state.name;
      recorderDescription = state.description;
      // Defensive default — sessions persisted by older builds lack the field.
      recorderRunAs = state.runAs ?? '';
      recorderActive = true;
      addRecorderListeners();
      // Re-show the overlay after a page reload mid-recording and seed its
      // feed from the restored buffer.
      mountRecorderOverlay({ name: recorderName, onStop: requestOverlayStop });
      syncRecorderOverlay(recordedEvents);
      console.log('[webspec] recorder resumed:', state.events.length, 'events buffered');
      return;
    } catch (err) {
      console.warn(`[webspec] bootstrap attempt ${attempt} rejected:`, err);
      await sleep(50 * attempt);
    }
  }
  console.error('[webspec] bootstrap failed after 3 attempts; recording state lost');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const bootstrapPromise = bootstrapRecorder();

function getRecorderStatus(): RecorderStatusResponse {
  if (
    !recorderActive ||
    recorderStartedAtIso === null ||
    recorderStartUrl === null ||
    recorderName === null ||
    recorderDescription === null ||
    recorderRunAs === null
  ) {
    return { ok: true, recording: false };
  }
  return {
    ok: true,
    recording: true,
    startedAt: recorderStartedAtIso,
    startUrl: recorderStartUrl,
    name: recorderName,
    description: recorderDescription,
    runAs: recorderRunAs,
    eventCount: recordedEvents.length,
  };
}

// ---------------------------------------------------------------------------
// Audit (unchanged shape from v0.3.8; tag list widened in v0.5.0).
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

  // Recorder messages wait on bootstrap so a popup query that lands during
  // the async restore on page reload still sees the resumed state.
  if (isRecorderStartRequest(message)) {
    void bootstrapPromise.then(() => sendResponse(startRecorder(message)));
    return true;
  }

  if (isRecorderStopRequest(message)) {
    void bootstrapPromise.then(() => sendResponse(stopRecorder()));
    return true;
  }

  if (isRecorderStatusRequest(message)) {
    void bootstrapPromise.then(() => sendResponse(getRecorderStatus()));
    return true;
  }

  // Navigation events pushed by the service worker land here. Absorb into
  // the live buffer only if a recording is in flight; otherwise tell the SW
  // we didn't take it so it can fall back to a direct storage write.
  if (isRecorderAppendEventRequest(message)) {
    void bootstrapPromise.then(() => {
      if (!recorderActive) {
        const response: RecorderAppendEventResponse = { ok: true, absorbed: false };
        sendResponse(response);
        return;
      }
      recordedEvents.push(message.event);
      persistSession();
      const response: RecorderAppendEventResponse = { ok: true, absorbed: true };
      sendResponse(response);
    });
    return true;
  }

  return false;
});
