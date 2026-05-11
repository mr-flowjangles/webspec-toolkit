/**
 * Typed message protocol between the popup and the content script.
 *
 * Kept in `src/shared/` so both entry points import the same definition —
 * no risk of the popup and content script drifting on the wire format.
 *
 * Two flows today:
 *   - audit: popup → content script, single round-trip with AxeResults back.
 *   - recorder: popup → content script start, content script captures events
 *     into module-scope state, popup → content script stop returns the array.
 *     v0.5.0 captures click + input + change + submit + keydown; hardened
 *     selectors, navigation tracking, and network capture are still pending.
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
// Internals
// ---------------------------------------------------------------------------

function isObjectWithType(value: unknown, expectedType: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === expectedType
  );
}
