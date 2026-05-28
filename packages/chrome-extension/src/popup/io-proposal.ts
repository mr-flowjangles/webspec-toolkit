/**
 * v1.7.2 — auto-propose Test Case inputs from a `WorkflowRecording` at
 * record-stop. Replaces the v1.6.2 "everything starts empty, user
 * authors each promotion by hand" UX: now the Save panel opens with the
 * recorded fills already proposed as named inputs; the user reviews,
 * unchecks unwanted ones, and edits names.
 *
 * Heuristic-first; no LLM round-trip in v1.7.2. The `BedrockAdapter`
 * fallback for harder cases (selectors with no obvious name attribute,
 * cross-language fields) lands in a later patch — see `docs/11` §
 * "Auto-proposed I/O at record-stop".
 *
 * Pure module — no React, no chrome.*. Tests in
 * `packages/chrome-extension/tests/io-proposal.test.ts`.
 */
import type {
  HardenedSelector,
  RecordedEvent,
  RecordingInput,
  WorkflowRecording,
} from '@webspec/core/browser';

/**
 * Walk the recording's events and propose one `RecordingInput` per
 * promotable fill / select-change event. Names are derived from the
 * selector (role[name=…] > #id > [data-…=…] > [name=…] > placeholder)
 * and uniquified per-recording.
 *
 * Skipped:
 *   - `input` events flagged sensitive (passwords) — promoting a masked
 *     value to a per-runner parameter is rarely what the user wants;
 *     auth profile substitution covers the credential case.
 *   - `input` / `change` events with an empty recorded value (nothing
 *     to parameterize).
 *   - `change` events without an `options` array (checkbox / radio).
 *     Per v1.6.4 known issue, those can't be parameterized in v1.6's
 *     whole-value substitution model — surfacing them as candidates
 *     leads to a declared-but-unused parameter.
 */
export function proposeInputsFromRecording(recording: WorkflowRecording): RecordingInput[] {
  const out: RecordingInput[] = [];
  const usedNames = new Set<string>();

  recording.events.forEach((event: RecordedEvent, eventIndex: number) => {
    const promotable = isPromotable(event);
    if (!promotable) return;
    const baseName = suggestNameFromSelector(event.selector);
    const name = uniquifyName(baseName, usedNames);
    usedNames.add(name);
    out.push({ name, eventIndex });
  });

  return out;
}

/**
 * Type guard — events promotable to parametric inputs in v1.6's MVP:
 *   - `input` events with non-empty, non-sensitive values
 *   - `change` events on selects (options !== undefined) with non-empty values
 *
 * Exported for use by `extractFillEventRows` consumers that want the
 * same filter; the v1.6.2 `extractFillEventRows` surfaces *all* fill
 * events because the user explicitly picks. v1.7.2's auto-propose path
 * needs the stricter filter applied here.
 */
export function isPromotable(event: RecordedEvent): event is PromotableEvent {
  if (event.kind === 'input') {
    if (event.sensitive) return false;
    if (event.value === '') return false;
    return true;
  }
  if (event.kind === 'change') {
    if (event.options === undefined) return false;
    if (event.value === '') return false;
    return true;
  }
  return false;
}

export type PromotableEvent =
  | Extract<RecordedEvent, { kind: 'input' }>
  | Extract<RecordedEvent, { kind: 'change' }>;

/**
 * Derive an input name from a `HardenedSelector`. Looks (in order) at:
 *   1. role=ROLE[name="Human Name"]  — the natural-language field label
 *   2. #identifier                    — element id
 *   3. [data-*="value"]               — test/automation attributes
 *   4. [name="value"]                 — form name attribute
 *   5. [placeholder="value"]          — placeholder text
 *
 * Falls back to `"input"` if none of the above match. The result is
 * camelCased and forced to start with a letter / underscore / `$` so it's
 * a valid JS identifier (matches `IDENT_RE` in `io-authoring.ts`).
 */
export function suggestNameFromSelector(selector: HardenedSelector): string {
  const candidates = [
    /\[name="([^"]+)"\]/, // role=textbox[name="Lead Name"] OR plain [name="lead-name"]
    /#([A-Za-z_][\w-]*)/, // #lead-name
    /\[data-[\w-]+="([^"]+)"\]/, // [data-test-id="email"]
    /\[placeholder="([^"]+)"\]/, // [placeholder="Enter email"]
  ];
  const preferred = selector.preferred;
  for (const re of candidates) {
    const m = preferred.match(re);
    if (m?.[1] !== undefined && m[1].trim() !== '') {
      return ensureValidIdentifier(toCamelCase(m[1]));
    }
  }
  return 'input';
}

function toCamelCase(s: string): string {
  const parts = s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '';
  const [first, ...rest] = parts;
  return (
    first!.toLowerCase() +
    rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')
  );
}

function ensureValidIdentifier(s: string): string {
  if (s === '') return 'input';
  if (/^[A-Za-z_$]/.test(s)) return s;
  // Starts with a digit (e.g. camelCased from "2 Name" -> "2Name"). Prefix
  // with a generic letter so the renderer's identifier emit stays valid.
  return `input${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

function uniquifyName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}
