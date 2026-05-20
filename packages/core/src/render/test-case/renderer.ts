/**
 * Test Case renderer — v1.5.0 helper-module shape.
 *
 * Each Test Case under `<repo>/test-cases/<slug>/` ships as TWO TypeScript
 * files (alongside the unchanged `recording.json`):
 *
 *   - `recording.ts`        — emitted by `renderTestCaseModule`. Exports
 *                             `async function run({ page, context })` — the
 *                             reusable body. Queues import this; the
 *                             standalone spec imports this. Single source of
 *                             truth.
 *   - `recording.spec.ts`   — emitted by `renderTestCaseSpec`. Thin wrapper
 *                             that imports `run`, applies the recording's
 *                             baked-in auth headers (if any), and calls it
 *                             inside one `test()`. Keeps the Test Case
 *                             standalone-runnable.
 *
 * The helper module does NOT touch headers — auth is the caller's concern.
 * The standalone spec uses `recording.auth` (the v1.3 ModHeader-equivalent
 * snapshot baked at record-time); Queue specs use the step's resolved
 * AuthProfile headers (which can differ per step's runAs).
 *
 * See `docs/10-team-shareability.md` § "v1.5.0 — Reusable Test Cases
 * (design locked)".
 */
import type { WorkflowRecording } from '../../types/analysis.js';
import { renderEvent } from '../e2e/renderer.js';

/**
 * Emit the contents of `recording.ts` — a TypeScript module exporting
 * `async function run({ page, context }): Promise<void>` for both the
 * standalone Test Case spec AND Queue specs to import. No `test()`, no
 * headers, no assertions beyond what the recorded events carry.
 */
export function renderTestCaseModule(recording: WorkflowRecording): string {
  const lines: string[] = [];

  lines.push("import type { BrowserContext, Page } from '@playwright/test';");
  lines.push('');
  lines.push('/**');
  for (const descLine of recording.description.split('\n')) {
    lines.push(` * ${descLine}`);
  }
  lines.push(' *');
  lines.push(` * Recorded ${recording.startedAt}; runAs: ${recording.runAs ?? '(none)'}.`);
  lines.push(' * Auth header injection is the caller\'s concern — Queue specs apply per-step');
  lines.push(' * headers from the matching AuthProfile, and the sibling recording.spec.ts');
  lines.push(' * applies the headers baked into recording.json.');
  lines.push(' */');
  lines.push(
    'export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void> {',
  );
  lines.push('  // context is unused in the helper body itself but kept on the signature so');
  lines.push("  // callers don't have to special-case the destructure when threading auth.");
  lines.push('  void context;');
  lines.push('');
  lines.push(`  await page.goto(${quote(recording.startUrl)});`);

  for (const event of recording.events) {
    const rendered = renderEvent(event);
    for (const line of rendered) lines.push(`  ${line}`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Emit the contents of `recording.spec.ts` — a thin wrapper that imports
 * the helper from `./recording.js` (Playwright's TS loader resolves the
 * `.js` extension to the `.ts` source under NodeNext / ESM), applies the
 * baked-in `recording.auth` headers if present, and runs the helper inside
 * one `test()`. Standalone-runnable via `npx playwright test`.
 */
export function renderTestCaseSpec(recording: WorkflowRecording): string {
  const auth = recording.auth ?? null;
  const hasAuth = auth !== null && Object.keys(auth.headers).length > 0;
  const fixtures = hasAuth ? '{ page, context }' : '{ page, context }'; // context always supplied to forward to run()
  const lines: string[] = [];

  lines.push("import { expect, test } from '@playwright/test';");
  lines.push("import { run } from './recording.js';");
  lines.push('');
  // expect is re-exported so future hand-edits to this spec (adding
  // assertions around the helper call) work without an extra import. Mark
  // as intentionally unused so eslint stays quiet.
  lines.push('void expect;');
  lines.push('');
  lines.push(`test(${quote(recording.name)}, async (${fixtures}) => {`);
  if (hasAuth && auth !== null) {
    lines.push('  await context.setExtraHTTPHeaders({');
    for (const [name, value] of Object.entries(auth.headers)) {
      lines.push(`    ${quote(name)}: ${quote(value)},`);
    }
    lines.push('  });');
  }
  lines.push('  await run({ page, context });');
  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

// String literal quoting — same single-quote-default / JSON.stringify-fallback
// rules the e2e and queue renderers use. Duplicated here to keep this module's
// surface narrow rather than re-exporting an internal helper.
function quote(value: string): string {
  if (/^[\x20-\x26\x28-\x5b\x5d-\x7e]*$/.test(value) && !value.includes("'")) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
}
