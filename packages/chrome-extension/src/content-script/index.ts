/**
 * Content script — runs in every http(s) tab at `document_idle`.
 *
 * Hosts two modes:
 *   - Audit: on `audit:request`, run axe-core and return raw AxeResults.
 *   - Recorder: between `recorder:start` and `recorder:stop`, capture DOM
 *     events into a module-scope buffer; return the buffer on stop.
 *
 * v0.5.1 recorder scope:
 *   - Captures `click`, `input`, `change`, `submit`, `keydown` events.
 *   - `<input type="password">` is masked: value not captured, sensitive=true.
 *   - `keydown` only captures "significant" keys (Enter/Tab/Escape/Arrows/
 *     PageUp-Down/Home/End). Character typing flows through `input` instead.
 *   - Contiguous `input` events on the same field are coalesced into one
 *     event holding the final value — one sentence, not one event per key.
 *   - A focusing `click` immediately followed by an `input` on the same
 *     field is dropped — `fill()` focuses on its own.
 *   - A checkbox/radio click fires both `click` and `change`; the preceding
 *     `click` is dropped so one user action yields one event.
 *   - Selectors are hardened at capture time (`data-testid` > role+name >
 *     text > css). See `selectors.ts`.
 *   - State doesn't survive page reload — chrome.storage.session move pending.
 */
import axe from 'axe-core';
import type { RecordedEvent } from '@webspec/core/browser';
import {
  isAuditRequest,
  isRecorderStartRequest,
  isRecorderStatusRequest,
  isRecorderStopRequest,
  type AuditResponse,
  type RecorderStartResponse,
  type RecorderStatusResponse,
  type RecorderStopResponse,
} from '../shared/messages.js';
import { buildHardenedSelector } from './selectors.js';
import type { HardenedSelector } from '@webspec/core/browser';

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
// Recorder state — module-scope. Lives only while the tab + content script
// stays alive; state-persistence across page navigations is deferred.
// ---------------------------------------------------------------------------

let recorderActive = false;
let recordedEvents: RecordedEvent[] = [];
let recorderStartTime = 0;
// Wall-clock ISO + URL captured at start so the popup can rehydrate its UI
// after closing and reopening — the popup's React state doesn't survive that
// but the content script does, so the truth lives here.
let recorderStartedAtIso: string | null = null;
let recorderStartUrl: string | null = null;

function timestamp(): number {
  return performance.now() - recorderStartTime;
}

function selectorFor(target: Element): HardenedSelector {
  return buildHardenedSelector(target);
}

function handleClick(ev: MouseEvent): void {
  if (!recorderActive) return;
  const target = ev.target;
  if (!(target instanceof Element)) return;

  recordedEvents.push({
    t: timestamp(),
    kind: 'click',
    selector: selectorFor(target),
    ...(target.textContent ? { targetText: target.textContent.trim().slice(0, 80) } : {}),
  });
}

function handleInput(ev: Event): void {
  if (!recorderActive) return;
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
}

function handleChange(ev: Event): void {
  if (!recorderActive) return;
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
    }
    return;
  }
  if (target instanceof HTMLSelectElement) {
    recordedEvents.push({
      t: timestamp(),
      kind: 'change',
      selector: selectorFor(target),
      value: target.value,
    });
  }
}

function handleSubmit(ev: SubmitEvent): void {
  if (!recorderActive) return;
  const target = ev.target;
  if (!(target instanceof HTMLFormElement)) return;

  recordedEvents.push({
    t: timestamp(),
    kind: 'submit',
    selector: selectorFor(target),
  });
}

function handleKeydown(ev: KeyboardEvent): void {
  if (!recorderActive) return;
  if (!SIGNIFICANT_KEYS.has(ev.key)) return;

  const target = ev.target;
  const selector = target instanceof Element ? selectorFor(target) : undefined;
  recordedEvents.push({
    t: timestamp(),
    kind: 'keydown',
    key: ev.key,
    ...(selector ? { selector } : {}),
  });
}

function startRecorder(): RecorderStartResponse {
  if (recorderActive) {
    return { ok: false, error: 'Recorder already running in this tab.' };
  }
  recordedEvents = [];
  recorderStartTime = performance.now();
  recorderStartedAtIso = new Date().toISOString();
  recorderStartUrl = location.href;
  recorderActive = true;
  document.addEventListener('click', handleClick, { capture: true });
  document.addEventListener('input', handleInput, { capture: true });
  document.addEventListener('change', handleChange, { capture: true });
  document.addEventListener('submit', handleSubmit, { capture: true });
  document.addEventListener('keydown', handleKeydown, { capture: true });
  return { ok: true, startedAt: recorderStartedAtIso, startUrl: recorderStartUrl };
}

function stopRecorder(): RecorderStopResponse {
  if (!recorderActive) {
    return { ok: false, error: 'Recorder is not running. Click Record first.' };
  }
  recorderActive = false;
  recorderStartedAtIso = null;
  recorderStartUrl = null;
  document.removeEventListener('click', handleClick, { capture: true });
  document.removeEventListener('input', handleInput, { capture: true });
  document.removeEventListener('change', handleChange, { capture: true });
  document.removeEventListener('submit', handleSubmit, { capture: true });
  document.removeEventListener('keydown', handleKeydown, { capture: true });
  const events = recordedEvents;
  recordedEvents = [];
  return { ok: true, endedAt: new Date().toISOString(), events };
}

function getRecorderStatus(): RecorderStatusResponse {
  if (!recorderActive || recorderStartedAtIso === null || recorderStartUrl === null) {
    return { ok: true, recording: false };
  }
  return {
    ok: true,
    recording: true,
    startedAt: recorderStartedAtIso,
    startUrl: recorderStartUrl,
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

  if (isRecorderStartRequest(message)) {
    sendResponse(startRecorder());
    return false;
  }

  if (isRecorderStopRequest(message)) {
    sendResponse(stopRecorder());
    return false;
  }

  if (isRecorderStatusRequest(message)) {
    sendResponse(getRecorderStatus());
    return false;
  }

  return false;
});
