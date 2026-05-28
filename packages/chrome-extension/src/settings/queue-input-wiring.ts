/**
 * v1.6.3 — pure helpers for the Queue composer's per-step Inputs subsection.
 *
 * The composer needs to:
 *   1. Decide which earlier steps can supply outputs (only non-iterated ones
 *      per the locked design decision).
 *   2. Validate the user's wiring across steps (every declared input wired;
 *      `output`-mode references point at a valid earlier step + output name).
 *   3. Build the final `QueueStep.inputValues` record from draft form state.
 *
 * Keeping these out of the React component lets vitest exercise them without
 * a render. Matches the pattern from v1.6.2's `io-authoring.ts`.
 */
import type {
  QueueStepInputValue,
  RecordingInput,
  RecordingOutput,
} from '@webspec/core/browser';

/**
 * Per-step compose-time view: which Test Case the step references, its
 * iteration count (1 if unset), and the declared I/O on that Test Case.
 * The composer builds one of these per step from the in-progress draft state
 * + the `TestCaseSummary` map and passes the array to `availableOutputSources`
 * and `validateInputWiring`.
 */
export interface ComposerStepView {
  /** Slug of the referenced Test Case (matches `recording.json` directory name). */
  testCaseSlug: string;
  /** Number of iterations the step is set to run. Treat undefined as 1. */
  iterations: number;
  /** Inputs declared on this step's Test Case (from the v1.6 recording schema). */
  testCaseInputs: RecordingInput[];
  /** Outputs declared on this step's Test Case. */
  testCaseOutputs: RecordingOutput[];
}

/**
 * One entry in the "from step N → outputName" dropdown for a step's input
 * wiring. `step` is 1-based to match `QueueStepInputValue.step`.
 */
export interface AvailableOutputSource {
  step: number;
  testCaseSlug: string;
  outputName: string;
}

/**
 * Given the full list of steps and the index of the step that's about to
 * pick an output reference, return every earlier non-iterated step's
 * declared outputs in render order. Iterated earlier steps are hidden
 * (per the v1.6 design lock: "iterated steps can't supply outputs to later
 * steps"). The current step and any later steps are excluded — output
 * references only flow forward.
 */
export function availableOutputSources(
  steps: ComposerStepView[],
  currentStepIndex: number,
): AvailableOutputSource[] {
  const out: AvailableOutputSource[] = [];
  for (let i = 0; i < currentStepIndex; i++) {
    const step = steps[i];
    if (step === undefined) continue;
    if (step.iterations > 1) continue;
    for (const output of step.testCaseOutputs) {
      out.push({
        step: i + 1,
        testCaseSlug: step.testCaseSlug,
        outputName: output.name,
      });
    }
  }
  return out;
}

export type WiringValidationError =
  | {
      kind: 'unwired-input';
      stepIndex: number;
      inputName: string;
      message: string;
    }
  | {
      kind: 'invalid-output-reference';
      stepIndex: number;
      inputName: string;
      message: string;
    };

/**
 * Validate the wiring on a single step. Returns errors for:
 *   - Each declared input on the step's Test Case that has no entry in
 *     `wiring` (or has a `constant` entry with empty value, OR has an
 *     `output` entry whose value is the unselected placeholder).
 *   - Each `output`-mode entry whose target step is out of range, is the
 *     current step or later, is iterated, or doesn't declare the named output.
 *
 * Returns `[]` when the step's wiring is complete and consistent.
 */
export function validateStepWiring(
  steps: ComposerStepView[],
  currentStepIndex: number,
  wiring: Record<string, QueueStepInputValue>,
): WiringValidationError[] {
  const errors: WiringValidationError[] = [];
  const currentStep = steps[currentStepIndex];
  if (currentStep === undefined) return errors;

  for (const declaredInput of currentStep.testCaseInputs) {
    const entry = wiring[declaredInput.name];
    if (entry === undefined) {
      errors.push({
        kind: 'unwired-input',
        stepIndex: currentStepIndex,
        inputName: declaredInput.name,
        message: `Input "${declaredInput.name}" is not wired.`,
      });
      continue;
    }
    if (entry.mode === 'constant') {
      // Empty-string constants are allowed (e.g. testing the empty-input
      // failure mode); only missing wiring is an error.
      continue;
    }
    // mode: 'output' — cross-step validation
    if (entry.step <= 0 || entry.step > currentStepIndex) {
      errors.push({
        kind: 'invalid-output-reference',
        stepIndex: currentStepIndex,
        inputName: declaredInput.name,
        message: `Input "${declaredInput.name}" references step ${entry.step}, which is not an earlier step.`,
      });
      continue;
    }
    const targetStep = steps[entry.step - 1];
    if (targetStep === undefined) {
      errors.push({
        kind: 'invalid-output-reference',
        stepIndex: currentStepIndex,
        inputName: declaredInput.name,
        message: `Input "${declaredInput.name}" references missing step ${entry.step}.`,
      });
      continue;
    }
    if (targetStep.iterations > 1) {
      errors.push({
        kind: 'invalid-output-reference',
        stepIndex: currentStepIndex,
        inputName: declaredInput.name,
        message: `Input "${declaredInput.name}" references step ${entry.step}, which is iterated (${targetStep.iterations}×) and cannot supply outputs.`,
      });
      continue;
    }
    const hasOutput = targetStep.testCaseOutputs.some((o) => o.name === entry.outputName);
    if (!hasOutput) {
      errors.push({
        kind: 'invalid-output-reference',
        stepIndex: currentStepIndex,
        inputName: declaredInput.name,
        message: `Input "${declaredInput.name}" references "${entry.outputName}" on step ${entry.step}, but that step's Test Case does not declare that output.`,
      });
    }
  }
  return errors;
}

/**
 * Compact `wiring` into the `QueueStep.inputValues` shape: keep entries that
 * match a currently-declared input, drop stale entries (Test Case was changed
 * and its old inputs no longer apply), drop empty-key entries. Returns
 * `undefined` when the step's Test Case declares no inputs — keeps the
 * manifest tidy by omitting the field rather than emitting `{}`.
 */
export function buildInputValuesForStep(
  declaredInputs: RecordingInput[],
  wiring: Record<string, QueueStepInputValue>,
): Record<string, QueueStepInputValue> | undefined {
  if (declaredInputs.length === 0) return undefined;
  const declaredNames = new Set(declaredInputs.map((i) => i.name));
  const result: Record<string, QueueStepInputValue> = {};
  for (const [name, value] of Object.entries(wiring)) {
    if (!declaredNames.has(name)) continue;
    result[name] = value;
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * v1.7.4 — auto-wire a step's declared inputs to earlier non-iterated
 * steps' outputs by name match. Replaces the v1.6.3 default of every
 * input starting as a blank-value constant — now common cases ("step 2
 * needs `leadName`; step 1 produces `leadName`") wire themselves; the
 * composer UI only surfaces unresolved cases for the user to confirm.
 *
 * **Rules:**
 *   - For each declared input on the current step:
 *     - Look for a matching-name output in `availableOutputSources`
 *       (those are already filtered to earlier non-iterated steps).
 *     - If exactly one match: emit a `{ mode: 'output', step, outputName }`
 *       wiring entry.
 *     - If multiple matches: emit nothing — user must disambiguate in UI.
 *     - If zero matches: emit nothing — user supplies a constant or marks
 *       unresolved.
 *
 * Preserves any pre-existing entry in `currentWiring` (e.g. user already
 * picked a constant for an input that also has an auto-wire candidate —
 * respect their choice).
 *
 * Strict name match (no fuzzy/Levenshtein) — per the v1.7 design doc,
 * v1.7 MVP is strict; relax if real usage produces too many unresolved
 * cases that should have matched.
 */
export function autoWireInputs(
  declaredInputs: RecordingInput[],
  availableOutputSources: AvailableOutputSource[],
  currentWiring: Record<string, QueueStepInputValue> = {},
): Record<string, QueueStepInputValue> {
  // Group available sources by output name so we can detect ambiguity.
  const sourcesByName = new Map<string, AvailableOutputSource[]>();
  for (const src of availableOutputSources) {
    const list = sourcesByName.get(src.outputName);
    if (list === undefined) {
      sourcesByName.set(src.outputName, [src]);
    } else {
      list.push(src);
    }
  }
  const result: Record<string, QueueStepInputValue> = { ...currentWiring };
  for (const input of declaredInputs) {
    if (result[input.name] !== undefined) continue; // respect existing wiring
    const candidates = sourcesByName.get(input.name);
    if (candidates === undefined || candidates.length !== 1) continue;
    const only = candidates[0]!;
    result[input.name] = {
      mode: 'output',
      step: only.step,
      outputName: only.outputName,
    };
  }
  return result;
}
