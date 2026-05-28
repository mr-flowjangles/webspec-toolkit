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
import type {
  RecordingOutput,
  WorkflowRecording,
} from '../../types/analysis.js';
import { renderEvent } from '../e2e/renderer.js';

/**
 * Emit the contents of `recording.ts` — a TypeScript module exporting
 * `async function run({ page, context }, inputs?) → Promise<outputs>` for both
 * the standalone Test Case spec AND Queue specs to import. No `test()`, no
 * headers, no assertions beyond what the recorded events carry.
 *
 * v1.6.4 — when `recording.inputs[]` is non-empty, the helper accepts a
 * second positional `inputs` parameter typed against the declared names; the
 * default value uses the **recorded literals** (preserves standalone replay
 * fidelity per docs/10 § "Standalone Test Case spec"). Each promoted event's
 * recorded value is substituted with `inputs.<name>` at the action site.
 *
 * v1.6.4 — when `recording.outputs[]` is non-empty, extraction code runs after
 * the last recorded action and the helper returns the named outputs:
 *   - `kind: 'url'`   → `page.url().match(pattern)?.[1] ?? ''`
 *   - `kind: 'text'`  → `(await page.locator(selector).first().textContent()) ?? ''` (trimmed)
 */
export function renderTestCaseModule(recording: WorkflowRecording): string {
  const lines: string[] = [];

  const declaredInputs = recording.inputs ?? [];
  const declaredOutputs = recording.outputs ?? [];

  // Map promoted event index → TS expression substituted at the action site.
  // Built from the user-declared inputs (the schema validates names + indices;
  // any input that doesn't have a matching recorded event is the Save UI's bug,
  // not ours — the helper still emits and the unused `inputs.<name>` field
  // becomes a dead parameter, surfacing the issue at TypeScript or test time).
  const subsByIndex = new Map<number, string>();
  for (const input of declaredInputs) {
    subsByIndex.set(input.eventIndex, `inputs.${input.name}`);
  }

  // Recorded-literal defaults for `inputs` parameter so standalone replay still
  // reproduces the recorded run. Pulled per-event so we substitute the same
  // literal the unmodified action would have emitted.
  const inputDefaults = new Map<string, string>();
  for (const input of declaredInputs) {
    const event = recording.events[input.eventIndex];
    if (event !== undefined && (event.kind === 'input' || event.kind === 'change')) {
      inputDefaults.set(input.name, event.value);
    } else {
      // Event-kind mismatch — schema permits any non-negative index; default
      // to empty string rather than crashing the renderer.
      inputDefaults.set(input.name, '');
    }
  }

  // v1.7.7 — `expect` is used by event-renderer-emitted `toHaveURL` assertions
  // for navigate events. Import as value (with type-only BrowserContext/Page
  // bundled) so the helper compiles regardless of whether the recording
  // happened to capture a navigate. The bundle cost is zero — `@playwright/
  // test` is already pulled in for the types.
  lines.push("import { expect, type BrowserContext, type Page } from '@playwright/test';");
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

  // Signature — three shapes depending on whether the recording has declared
  // inputs and/or outputs. Optional inputs param so bare `run({ page, context })`
  // still type-checks against the recorded-literal defaults.
  const inputsTypeAnnotation = renderInputsTypeAnnotation(declaredInputs);
  const inputsDefaultExpr = renderInputsDefaultExpr(declaredInputs, inputDefaults);
  const returnTypeAnnotation = renderReturnTypeAnnotation(declaredOutputs);

  if (declaredInputs.length === 0) {
    lines.push(
      `export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<${returnTypeAnnotation}> {`,
    );
  } else {
    lines.push(
      `export async function run(`,
    );
    lines.push(`  { page, context }: { page: Page; context: BrowserContext },`);
    lines.push(`  inputs: ${inputsTypeAnnotation} = ${inputsDefaultExpr},`);
    lines.push(`): Promise<${returnTypeAnnotation}> {`);
  }

  lines.push('  // context is unused in the helper body itself but kept on the signature so');
  lines.push("  // callers don't have to special-case the destructure when threading auth.");
  lines.push('  void context;');
  if (declaredInputs.length === 0) {
    // `inputs` not declared → no `void inputs` needed.
  } else if (subsByIndex.size === 0) {
    // Inputs declared but no event references them — shouldn't happen via the
    // Save UI but stays valid. Mark unused so tsc/eslint don't complain.
    lines.push('  void inputs;');
  }
  lines.push('');
  lines.push(`  await page.goto(${quote(recording.startUrl)});`);

  recording.events.forEach((event, eventIndex) => {
    const override = subsByIndex.get(eventIndex);
    const rendered = renderEvent(event, override);
    for (const line of rendered) lines.push(`  ${line}`);
  });

  // v1.6.4 — extraction tail. Runs after the last recorded action; one block
  // per declared output; final `return { ... }`. Skipped entirely when there
  // are no outputs (helper stays `Promise<void>`).
  if (declaredOutputs.length > 0) {
    lines.push('');
    lines.push('  // v1.6 output extraction — runs after the last recorded action.');
    const returnFields: string[] = [];
    for (const output of declaredOutputs) {
      const localVar = `_out_${output.name}`;
      if (output.source.kind === 'url') {
        // Compile the RegExp inline. We don't try to validate it here — bad
        // patterns surface at test time as `match === null`, returning ''.
        lines.push(
          `  const ${localVar} = page.url().match(${regexLiteral(output.source.pattern)})?.[1] ?? '';`,
        );
      } else {
        lines.push(
          `  const ${localVar} = ((await ${pageLocator(output.source.selector)}.first().textContent()) ?? '').trim();`,
        );
      }
      returnFields.push(`${output.name}: ${localVar}`);
    }
    lines.push(`  return { ${returnFields.join(', ')} };`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function renderInputsTypeAnnotation(
  inputs: { name: string }[],
): string {
  if (inputs.length === 0) return '{}';
  const fields = inputs.map((i) => `${i.name}: string`).join('; ');
  return `{ ${fields} }`;
}

function renderInputsDefaultExpr(
  inputs: { name: string }[],
  defaults: Map<string, string>,
): string {
  if (inputs.length === 0) return '{}';
  const pairs = inputs.map((i) => `${i.name}: ${quote(defaults.get(i.name) ?? '')}`);
  return `{ ${pairs.join(', ')} }`;
}

function renderReturnTypeAnnotation(outputs: RecordingOutput[]): string {
  if (outputs.length === 0) return 'void';
  const fields = outputs.map((o) => `${o.name}: string`).join('; ');
  return `{ ${fields} }`;
}

/**
 * Render a regex pattern as a JS RegExp literal (`/pattern/`). The user's
 * pattern string is wrapped in slashes and any unescaped forward slashes
 * inside the body are escaped — otherwise `/leads/(\d+)/` would terminate
 * the literal mid-pattern. Newlines are stripped (a multi-line regex
 * shouldn't appear in a URL pattern but be defensive).
 */
function regexLiteral(pattern: string): string {
  const safe = pattern.replace(/\n/g, '').replace(/\//g, '\\/');
  return `/${safe}/`;
}

/**
 * Render a CSS selector as a `page.locator(...)` call with the selector
 * string properly quoted. The selector is a single string the user supplied;
 * we don't try to parse it.
 */
function pageLocator(selector: string): string {
  return `page.locator(${quote(selector)})`;
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
