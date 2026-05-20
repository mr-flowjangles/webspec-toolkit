/**
 * QueueRenderer — pure function: Queue + recordings + auth profiles
 * → Playwright `.spec.ts` source for the whole queue.
 *
 * v1.4 MVP renderer. Composes one `test.describe.serial(...)` per queue with
 * one `test()` per step (clear failure attribution; the describe.serial
 * preserves order and shares the browser context across steps). Test Case
 * bodies are inlined verbatim — no reuse yet (v1.5+ activates Test Cases as
 * importable helpers). Iteration loops wrap a step's body when
 * `step.iterations > 1`.
 *
 * Header-switching semantics: each step resolves its auth headers via
 * `matchProfile(authProfiles, recording.startUrl)` + `resolveProfileHeaders`,
 * then emits `await context.setExtraHTTPHeaders({ ... })` only when the
 * resolved headers differ from the prior step's. The first step with auth
 * always emits a fresh call.
 *
 * See `docs/10-team-shareability.md` § "How a Queue renders to Playwright"
 * for the locked output shape.
 */
import type { WorkflowRecording } from '../../types/analysis.js';
import type { Queue, QueueStep } from '../../library/queue.js';
import {
  matchProfile,
  resolveProfileHeaders,
  type AuthProfileList,
} from '../../library/auth-profile.js';
import { renderEvent } from '../e2e/renderer.js';

export interface RenderQueueSpecArgs {
  queue: Queue;
  /**
   * Map of `QueueStep.testCase` slug → the recorded `WorkflowRecording` for
   * that Test Case. Throws if a step references a slug that isn't present.
   */
  recordings: Map<string, WorkflowRecording>;
  authProfiles: AuthProfileList;
}

export function renderQueueSpec(args: RenderQueueSpecArgs): string {
  const { queue, recordings, authProfiles } = args;

  const lines: string[] = [];
  lines.push(`// Queue: ${queue.name}`);
  lines.push("import { expect, test } from '@playwright/test';");
  lines.push('');
  lines.push(`test.describe.serial(${quote(queue.name)}, () => {`);

  // Inputs become constants at the top of the describe block. v1.4 MVP only
  // declares them; the inlined Test Case bodies don't reference them yet
  // (reuse + wiring is a v1.5+ concern).
  if (queue.inputs.length > 0) {
    for (const input of queue.inputs) {
      lines.push(`  const ${input.name} = ${quote(input.value)};`);
    }
    lines.push('');
  }

  // Header-switching: compare resolved headers across step boundaries so we
  // only emit a setExtraHTTPHeaders call when they actually change. Serialised
  // to a canonical JSON form so { a:1, b:2 } and { b:2, a:1 } compare equal.
  let prevHeadersKey: string | null = null;

  queue.steps.forEach((step, idx) => {
    const recording = recordings.get(step.testCase);
    if (recording === undefined) {
      throw new Error(
        `renderQueueSpec: no recording supplied for step ${idx + 1} (testCase='${step.testCase}'). ` +
          `Make sure the recordings map contains an entry for every step.testCase slug in the queue.`,
      );
    }

    const headers = resolveStepHeaders(authProfiles, recording, step);
    const headersChanged =
      headers !== null && canonicalKey(headers) !== prevHeadersKey;
    const needsContext = headersChanged;

    if (idx > 0) lines.push('');
    const fixtures = needsContext ? '{ page, context }' : '{ page }';
    const title = stepTitle(idx, step);
    lines.push(`  test(${quote(title)}, async (${fixtures}) => {`);

    const body: string[] = [];

    if (headersChanged && headers !== null) {
      body.push(`await context.setExtraHTTPHeaders({`);
      for (const [name, value] of Object.entries(headers)) {
        body.push(`  ${quote(name)}: ${quote(value)},`);
      }
      body.push(`});`);
    }

    // Inline the recording: description as a comment, goto(startUrl), then
    // each captured event re-emitted via the e2e renderer's helper.
    for (const descLine of recording.description.split('\n')) {
      body.push(`// ${descLine}`);
    }
    body.push(`await page.goto(${quote(recording.startUrl)});`);
    for (const event of recording.events) {
      for (const line of renderEvent(event)) body.push(line);
    }

    const iterations = step.iterations ?? 1;
    if (iterations > 1) {
      lines.push(`    for (let i = 0; i < ${iterations}; i++) {`);
      for (const line of body) lines.push(`      ${line}`);
      lines.push(`    }`);
    } else {
      for (const line of body) lines.push(`    ${line}`);
    }

    lines.push('  });');

    // Update tracker. If this step had no resolved headers at all, leave the
    // tracker as-is — a downstream step with the same null-headers state will
    // not re-emit either. If it had resolved headers, remember them.
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
 *
 * Note: this matches against the *recording's* startUrl, mirroring the v1.3
 * extension which matches at record-start time. The step's `runAs` then drives
 * the `${runAs}` substitution, which can differ per step (analyst on step 1,
 * supervisor on step 5, etc.).
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

// ---------------------------------------------------------------------------
// String literal quoting — kept in sync with `render/e2e/renderer.ts`. Both
// renderers want the same Playwright-Codegen-style single-quote-default,
// JSON.stringify fallback. Duplicated rather than re-exported to keep the
// e2e renderer's surface narrow.
// ---------------------------------------------------------------------------

function quote(value: string): string {
  if (/^[\x20-\x26\x28-\x5b\x5d-\x7e]*$/.test(value) && !value.includes("'")) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
}
