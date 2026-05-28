/**
 * QueueRenderer — pure function: Queue → Playwright `.spec.ts` source for the
 * whole queue.
 *
 * **v1.5.0 shape (import-based).** Step bodies no longer inline the recorded
 * events. Each step imports `run` from the corresponding Test Case helper
 * module (`<repo>/test-cases/<slug>/recording.ts` — see
 * `renderTestCaseModule`) under a slug-derived alias and calls it inside
 * `test()`. Edit the Test Case once → every Queue using it gets the fix.
 *
 * Layout produced:
 *
 *     // Queue: <name>
 *     import { expect, test } from '@playwright/test';
 *     import { run as createLead } from '../test-cases/create-lead/recording.js';
 *     import { run as fillDetails } from '../test-cases/fill-details/recording.js';
 *
 *     test.describe.serial('<name>', () => {
 *       const record_id = '...';            // queue.inputs[] as constants
 *
 *       test('Step 1 — create-lead (as ANALYST01)', async ({ page, context }) => {
 *         await context.setExtraHTTPHeaders({ uid: 'ANALYST01' });
 *         await createLead({ page, context });
 *       });
 *
 *       test('Step 2 — fill-details (as ANALYST01) × 3', async ({ page, context }) => {
 *         for (let i = 0; i < 3; i++) {
 *           await fillDetails({ page, context });
 *         }
 *       });
 *     });
 *
 * Header-switching semantics: each step resolves auth via
 * `matchProfile(authProfiles, recording.startUrl)` + `resolveProfileHeaders`,
 * and emits `setExtraHTTPHeaders` only when the resolved headers differ
 * from the prior step's. The renderer still needs each step's
 * `WorkflowRecording` because `recording.startUrl` drives the profile
 * match — even though the events themselves now live in the imported
 * helper module, not in the spec.
 *
 * See `docs/10-team-shareability.md` § "v1.5.0 — Reusable Test Cases".
 */
import type { WorkflowRecording } from '../../types/analysis.js';
import type {
  Queue,
  QueueStep,
  QueueStepInputValue,
} from '../../library/queue.js';
import {
  matchProfile,
  resolveProfileHeaders,
  type AuthProfileList,
} from '../../library/auth-profile.js';
import { slugToIdentifier } from '../../library/slug.js';

export interface RenderQueueSpecArgs {
  queue: Queue;
  /**
   * Map of `QueueStep.testCase` slug → the recorded `WorkflowRecording` for
   * that Test Case. Required for the recording's `startUrl` (drives auth
   * profile matching) — the events themselves aren't read by the renderer
   * anymore (v1.5.0+); they live in the helper module the spec imports.
   * Throws if a step references a slug that isn't present.
   */
  recordings: Map<string, WorkflowRecording>;
  authProfiles: AuthProfileList;
}

export function renderQueueSpec(args: RenderQueueSpecArgs): string {
  const { queue, recordings, authProfiles } = args;

  // First pass: validate every step's slug has a recording, and build the
  // dedup'd map of slug → identifier for the import block.
  const slugToAlias = new Map<string, string>();
  queue.steps.forEach((step, idx) => {
    if (!recordings.has(step.testCase)) {
      throw new Error(
        `renderQueueSpec: no recording supplied for step ${idx + 1} (testCase='${step.testCase}'). ` +
          `Make sure the recordings map contains an entry for every step.testCase slug in the queue.`,
      );
    }
    if (!slugToAlias.has(step.testCase)) {
      slugToAlias.set(step.testCase, slugToIdentifier(step.testCase));
    }
  });

  const lines: string[] = [];
  lines.push(`// Queue: ${queue.name}`);
  lines.push("import { expect, test } from '@playwright/test';");
  // Stable import order — sorted by slug so a Queue's spec stays
  // diff-friendly across resaves regardless of step ordering.
  const sortedSlugs = [...slugToAlias.keys()].sort();
  for (const slug of sortedSlugs) {
    const alias = slugToAlias.get(slug)!;
    lines.push(`import { run as ${alias} } from '../test-cases/${slug}/recording.js';`);
  }
  // expect is re-exported so a developer can hand-edit assertions around
  // the helper calls without an extra import. Mark intentionally unused.
  lines.push('void expect;');
  lines.push('');
  lines.push(`test.describe.serial(${quote(queue.name)}, () => {`);

  // Inputs become constants at the top of the describe block. v1.5.0 still
  // only declares them — input/output wiring is v1.5.1+.
  if (queue.inputs.length > 0) {
    for (const input of queue.inputs) {
      lines.push(`  const ${input.name} = ${quote(input.value)};`);
    }
    lines.push('');
  }

  // v1.6.4 — per-step local variable name when we need to capture the helper's
  // return value (forward-scan tells us if any later step references this
  // step's output). Format: `<slug-identifier>_<1-based-step-index>`.
  const stepLocals: string[] = queue.steps.map(
    (step, idx) => `${slugToAlias.get(step.testCase)!}_${idx + 1}`,
  );
  const stepIsReferenced = computeStepReferencedFlags(queue.steps);

  // Header-switching: compare resolved headers across step boundaries so we
  // only emit a setExtraHTTPHeaders call when they actually change.
  let prevHeadersKey: string | null = null;

  queue.steps.forEach((step, idx) => {
    const recording = recordings.get(step.testCase)!;
    const alias = slugToAlias.get(step.testCase)!;
    const headers = resolveStepHeaders(authProfiles, recording, step);
    const headersChanged = headers !== null && canonicalKey(headers) !== prevHeadersKey;

    if (idx > 0) lines.push('');
    const title = stepTitle(idx, step);
    lines.push(`  test(${quote(title)}, async ({ page, context }) => {`);

    if (headersChanged && headers !== null) {
      lines.push(`    await context.setExtraHTTPHeaders({`);
      for (const [name, value] of Object.entries(headers)) {
        lines.push(`      ${quote(name)}: ${quote(value)},`);
      }
      lines.push(`    });`);
    }

    const iterations = step.iterations ?? 1;
    const inputsArg = renderInputsArg(step.inputValues, stepLocals);
    const captureReturn = stepIsReferenced[idx] === true && iterations === 1;
    const lhs = captureReturn ? `const ${stepLocals[idx]} = ` : '';
    const helperCall =
      inputsArg === null
        ? `${alias}({ page, context })`
        : `${alias}({ page, context }, ${inputsArg})`;

    if (iterations > 1) {
      lines.push(`    for (let i = 0; i < ${iterations}; i++) {`);
      lines.push(`      await ${helperCall};`);
      lines.push(`    }`);
    } else {
      lines.push(`    ${lhs}await ${helperCall};`);
    }

    lines.push('  });');

    if (headers !== null) {
      prevHeadersKey = canonicalKey(headers);
    }
  });

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Resolve the auth headers for a step. Returns `null` when no profile matches
 * the recording's `startUrl` (no auth to inject); otherwise the resolved
 * `{ header: value }` record from `resolveProfileHeaders` substituted with
 * the step's `runAs`.
 */
function resolveStepHeaders(
  authProfiles: AuthProfileList,
  recording: WorkflowRecording,
  step: QueueStep,
): Record<string, string> | null {
  const profile = matchProfile(authProfiles, recording.startUrl);
  if (profile === null) return null;
  const headers = resolveProfileHeaders(profile, step.runAs);
  if (Object.keys(headers).length === 0) return null;
  return headers;
}

function stepTitle(idx: number, step: QueueStep): string {
  const base = `Step ${idx + 1} — ${step.testCase} (as ${step.runAs})`;
  const iterations = step.iterations ?? 1;
  return iterations > 1 ? `${base} × ${iterations}` : base;
}

/** Stable canonical form for comparing two header records by content. */
function canonicalKey(headers: Record<string, string>): string {
  const keys = Object.keys(headers).sort();
  return JSON.stringify(keys.map((k) => [k, headers[k]]));
}

// String literal quoting — same rules as the other renderers.
function quote(value: string): string {
  if (/^[\x20-\x26\x28-\x5b\x5d-\x7e]*$/.test(value) && !value.includes("'")) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
}

/**
 * v1.6.4 — for each step, decide whether to capture its helper return value
 * in a `const` local. The rule: capture iff some later step references this
 * step's output via `inputValues[name] = { mode: 'output', step: i+1, ... }`.
 * Per the v1.6 design lock, iterated steps cannot supply outputs (the
 * composer hides them from the picker), so we'd never flag an iterated step
 * — the validation that produces `inputValues` already enforces it — but
 * we keep the iteration check in the call-site too as belt-and-suspenders.
 */
function computeStepReferencedFlags(steps: QueueStep[]): boolean[] {
  const referenced = new Array<boolean>(steps.length).fill(false);
  for (let i = 1; i < steps.length; i++) {
    const wiring = steps[i]?.inputValues;
    if (wiring === undefined) continue;
    for (const value of Object.values(wiring)) {
      if (value.mode === 'output' && value.step >= 1 && value.step <= steps.length) {
        referenced[value.step - 1] = true;
      }
    }
  }
  return referenced;
}

/**
 * v1.6.4 — render the second positional argument to the helper call from
 * `step.inputValues`. Returns `null` when the step has no wiring (the bare
 * `helper({ page, context })` form is used). Constants emit as quoted
 * string literals; output references emit as `<local>.<outputName>` reads
 * against the captured return value of an earlier step.
 */
function renderInputsArg(
  inputValues: Record<string, QueueStepInputValue> | undefined,
  stepLocals: string[],
): string | null {
  if (inputValues === undefined || Object.keys(inputValues).length === 0) return null;
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(inputValues)) {
    if (value.mode === 'constant') {
      pairs.push(`${name}: ${quote(value.value)}`);
    } else {
      const local = stepLocals[value.step - 1];
      // The composer-side validator should have rejected an out-of-range
      // `value.step`; if a hand-edited manifest sneaks one through, render
      // a clearly-broken identifier so the test fails loudly rather than
      // crashing the renderer.
      const expr = local !== undefined ? local : `__missing_step_${value.step}`;
      pairs.push(`${name}: ${expr}.${value.outputName}`);
    }
  }
  return `{ ${pairs.join(', ')} }`;
}
