/**
 * Typed message protocol between the popup and the content script.
 *
 * Kept in `src/shared/` so both entry points import the same definition —
 * no risk of the popup and content script drifting on the wire format.
 *
 * The popup sends a request; the content script answers with `ok: true` and
 * raw `AxeResults` for the popup to normalize, or `ok: false` plus a string
 * error the popup surfaces verbatim.
 */
import type { AxeResults } from 'axe-core';

export interface AuditRequest {
  type: 'audit:request';
}

export type AuditResponse =
  | { ok: true; results: AxeResults }
  | { ok: false; error: string };

export function isAuditRequest(value: unknown): value is AuditRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'audit:request'
  );
}
