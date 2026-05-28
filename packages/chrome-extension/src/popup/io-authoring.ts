/**
 * v1.6.2 — pure helpers for the Test Case Save panel's Inputs/Outputs forms.
 *
 * The UI component (`IOAuthoringPanel.tsx`) is presentational and stateful but
 * delegates the testable transformations and validation to this module so the
 * unit tests can exercise them without rendering React.
 */
import type {
  RecordedEvent,
  RecordingInput,
  RecordingOutput,
  WorkflowRecording,
} from '@webspec/core/browser';

/**
 * Row shown to the user in the Inputs picker — one per fill-class event in
 * the recording. `value` is the recorded literal that would be replaced by
 * the named parameter at render time. `selectorPreview` is the selector's
 * `preferred` form, truncated for popup display.
 */
export interface FillEventRow {
  /** 0-based index into `recording.events[]`. */
  eventIndex: number;
  /** `'input'` (typed text) or `'change'` (select/checkbox). */
  kind: 'input' | 'change';
  value: string;
  selectorPreview: string;
  sensitive: boolean;
}

const SELECTOR_PREVIEW_MAX = 40;

function shortenSelector(s: string): string {
  if (s.length <= SELECTOR_PREVIEW_MAX) return s;
  return s.slice(0, SELECTOR_PREVIEW_MAX - 1) + '…';
}

/**
 * Walk `recording.events[]` and surface the fill-class events the user is
 * allowed to promote to a named input.
 *
 * Only `input` and `change` events carry a recorded `value`; everything else
 * (click, submit, keydown, navigate, assertObserved) has no value to
 * parameterize. Password-masked `input` events are still surfaced — the user
 * may explicitly want to promote a password field to a per-runner input —
 * but the row's `sensitive` flag lets the UI warn them.
 */
export function extractFillEventRows(recording: WorkflowRecording): FillEventRow[] {
  const out: FillEventRow[] = [];
  recording.events.forEach((event: RecordedEvent, eventIndex: number) => {
    if (event.kind !== 'input' && event.kind !== 'change') return;
    const selectorPreview = shortenSelector(event.selector.preferred);
    if (event.kind === 'input') {
      out.push({
        eventIndex,
        kind: 'input',
        value: event.value,
        selectorPreview,
        sensitive: event.sensitive,
      });
    } else {
      out.push({
        eventIndex,
        kind: 'change',
        value: event.value,
        selectorPreview,
        sensitive: false,
      });
    }
  });
  return out;
}

/** Identifier rules — must be valid JS identifier so it can become a destructured param. */
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isValidIOName(name: string): boolean {
  return IDENT_RE.test(name);
}

export interface IOValidationError {
  scope: 'inputs' | 'outputs';
  index: number;
  field: 'name' | 'pattern' | 'selector';
  message: string;
}

/**
 * Pure validator for the authored Inputs + Outputs the Save panel will hand to
 * the save handler. Returns the full set of validation errors so the UI can
 * display them inline next to the offending row. Empty array means the user
 * can hit Save.
 *
 * Rules (matching docs/10 § "Save UI changes"):
 *   - Every input has a non-empty, JS-identifier-shaped name.
 *   - Input names are unique within the inputs list.
 *   - Every output has a non-empty, JS-identifier-shaped name.
 *   - Output names are unique within the outputs list.
 *   - Input and output names live in separate namespaces (the helper signature
 *     is `(ctx, inputs) => outputs`; same name on both sides is fine and
 *     idiomatic, e.g. `leadName` in / `leadName` out).
 *   - URL-kind outputs must have a non-empty pattern.
 *   - Text-kind outputs must have a non-empty selector.
 */
export function validateIOAuthoring(args: {
  inputs: RecordingInput[];
  outputs: RecordingOutput[];
}): IOValidationError[] {
  const errors: IOValidationError[] = [];
  const seenInput = new Map<string, number>();
  args.inputs.forEach((input, index) => {
    if (!isValidIOName(input.name)) {
      errors.push({
        scope: 'inputs',
        index,
        field: 'name',
        message:
          input.name.trim() === ''
            ? 'Input name is required.'
            : 'Input name must be a valid identifier (letters, digits, _, $; cannot start with a digit).',
      });
    } else if (seenInput.has(input.name)) {
      errors.push({
        scope: 'inputs',
        index,
        field: 'name',
        message: `Duplicate input name "${input.name}".`,
      });
    } else {
      seenInput.set(input.name, index);
    }
  });

  const seenOutput = new Map<string, number>();
  args.outputs.forEach((output, index) => {
    if (!isValidIOName(output.name)) {
      errors.push({
        scope: 'outputs',
        index,
        field: 'name',
        message:
          output.name.trim() === ''
            ? 'Output name is required.'
            : 'Output name must be a valid identifier (letters, digits, _, $; cannot start with a digit).',
      });
    } else if (seenOutput.has(output.name)) {
      errors.push({
        scope: 'outputs',
        index,
        field: 'name',
        message: `Duplicate output name "${output.name}".`,
      });
    } else {
      seenOutput.set(output.name, index);
    }

    if (output.source.kind === 'url' && output.source.pattern.trim() === '') {
      errors.push({
        scope: 'outputs',
        index,
        field: 'pattern',
        message: 'URL pattern is required.',
      });
    } else if (output.source.kind === 'text' && output.source.selector.trim() === '') {
      errors.push({
        scope: 'outputs',
        index,
        field: 'selector',
        message: 'CSS selector is required.',
      });
    }
  });

  return errors;
}

/**
 * Convenience: merge authored inputs/outputs into a `WorkflowRecording` just
 * before serialization. Keeps the merge logic in one tested place so the save
 * handler stays a thin caller.
 */
export function attachIOToRecording(
  recording: WorkflowRecording,
  inputs: RecordingInput[],
  outputs: RecordingOutput[],
): WorkflowRecording {
  return { ...recording, inputs, outputs };
}
