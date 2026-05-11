/**
 * Typed message protocol between the popup and the content script.
 *
 * Kept in `src/shared/` so both entry points import the same definition —
 * no risk of the popup and content script drifting on the wire format.
 *
 * Three flows today:
 *   - audit: popup → content script, single round-trip with AxeResults back.
 *   - recorder: popup → content script start, content script captures events
 *     into module-scope state, popup → content script stop returns the array.
 *     v0.5.0 captures click + input + change + submit + keydown; v0.5.1 adds
 *     hardened selectors + event dedup.
 *   - recorder session: content script ↔ service worker. The service worker
 *     persists the in-flight recording in `chrome.storage.session` keyed by
 *     `sender.tab.id`, so a page reload (or any other content-script restart)
 *     doesn't drop the recording. v0.5.2.
 */
import type { AxeResults } from 'axe-core';
import type { RecordedEvent } from '@webspec/core/browser';

// ---------------------------------------------------------------------------
// Audit (v0.3.8 — unchanged)
// ---------------------------------------------------------------------------

export interface AuditRequest {
  type: 'audit:request';
}

export type AuditResponse =
  | { ok: true; results: AxeResults }
  | { ok: false; error: string };

export function isAuditRequest(value: unknown): value is AuditRequest {
  return isObjectWithType(value, 'audit:request');
}

// ---------------------------------------------------------------------------
// Recorder (v0.5.0 — click + input + change + submit + keydown)
// ---------------------------------------------------------------------------

export interface RecorderStartRequest {
  type: 'recorder:start';
}

export interface RecorderStopRequest {
  type: 'recorder:stop';
}

/**
 * Status query — the popup sends this on mount because the popup's React
 * state resets every time the popup closes (Chrome popups are transient),
 * but the recorder lives in the content script's module-scope and keeps
 * running. Without this rehydration, a recording started in one popup
 * session is unreachable from the next one.
 */
export interface RecorderStatusRequest {
  type: 'recorder:status';
}

export type RecorderStartResponse =
  | { ok: true; startedAt: string; startUrl: string }
  | { ok: false; error: string };

export type RecorderStopResponse =
  | { ok: true; endedAt: string; events: RecordedEvent[] }
  | { ok: false; error: string };

export type RecorderStatusResponse =
  | { ok: true; recording: false }
  | { ok: true; recording: true; startedAt: string; startUrl: string; eventCount: number }
  | { ok: false; error: string };

export function isRecorderStartRequest(value: unknown): value is RecorderStartRequest {
  return isObjectWithType(value, 'recorder:start');
}

export function isRecorderStopRequest(value: unknown): value is RecorderStopRequest {
  return isObjectWithType(value, 'recorder:stop');
}

export function isRecorderStatusRequest(value: unknown): value is RecorderStatusRequest {
  return isObjectWithType(value, 'recorder:status');
}

// ---------------------------------------------------------------------------
// Recorder session persistence (v0.5.2 — content script ↔ service worker)
//
// The service worker reads/writes `chrome.storage.session` keyed by
// `sender.tab.id` so the content script doesn't need to know its own tabId
// (Chrome doesn't expose `chrome.tabs.getCurrent()` to content scripts).
// One key per tab; one recording at a time per tab.
// ---------------------------------------------------------------------------

/**
 * Snapshot persisted between content-script restarts. `startedAtMs` is a
 * wall-clock `Date.now()` value; event timestamps are recomputed relative
 * to it so a page reload doesn't reset the recording timeline.
 */
export interface RecorderSessionState {
  startedAtIso: string;
  startUrl: string;
  startedAtMs: number;
  events: RecordedEvent[];
}

export interface RecorderSessionGetRequest {
  type: 'recorder:session:get';
}

export interface RecorderSessionPutRequest {
  type: 'recorder:session:put';
  state: RecorderSessionState;
}

export interface RecorderSessionClearRequest {
  type: 'recorder:session:clear';
}

export type RecorderSessionGetResponse =
  | { ok: true; state: RecorderSessionState | null }
  | { ok: false; error: string };

export type RecorderSessionPutResponse = { ok: true } | { ok: false; error: string };

export type RecorderSessionClearResponse = { ok: true } | { ok: false; error: string };

export function isRecorderSessionGetRequest(value: unknown): value is RecorderSessionGetRequest {
  return isObjectWithType(value, 'recorder:session:get');
}

export function isRecorderSessionPutRequest(value: unknown): value is RecorderSessionPutRequest {
  return isObjectWithType(value, 'recorder:session:put');
}

export function isRecorderSessionClearRequest(value: unknown): value is RecorderSessionClearRequest {
  return isObjectWithType(value, 'recorder:session:clear');
}

// ---------------------------------------------------------------------------
// Service worker → content script: append a captured event (v0.5.3)
//
// The service worker captures navigations via `chrome.webNavigation` and
// pushes them to the content script so they land in the same in-memory
// buffer as DOM events, in t-order. For cross-document navigations the
// content script may already be torn down — see service-worker/index.ts
// for the storage-write fallback path.
// ---------------------------------------------------------------------------

export interface RecorderAppendEventRequest {
  type: 'recorder:append-event';
  event: RecordedEvent;
}

export type RecorderAppendEventResponse =
  | { ok: true; absorbed: boolean }
  | { ok: false; error: string };

export function isRecorderAppendEventRequest(
  value: unknown,
): value is RecorderAppendEventRequest {
  return isObjectWithType(value, 'recorder:append-event');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isObjectWithType(value: unknown, expectedType: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === expectedType
  );
}
