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
 *     v0.4.1 captures clicks only; later PRs add input/change/submit/keydown,
 *     hardened selectors, and network capture via the service worker.
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
// Recorder (v0.4.1 — clicks-only skeleton; richer in subsequent PRs)
// ---------------------------------------------------------------------------

export interface RecorderStartRequest {
  type: 'recorder:start';
}

export interface RecorderStopRequest {
  type: 'recorder:stop';
}

export type RecorderStartResponse =
  | { ok: true; startedAt: string; startUrl: string }
  | { ok: false; error: string };

export type RecorderStopResponse =
  | { ok: true; endedAt: string; events: RecordedEvent[] }
  | { ok: false; error: string };

export function isRecorderStartRequest(value: unknown): value is RecorderStartRequest {
  return isObjectWithType(value, 'recorder:start');
}

export function isRecorderStopRequest(value: unknown): value is RecorderStopRequest {
  return isObjectWithType(value, 'recorder:stop');
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
