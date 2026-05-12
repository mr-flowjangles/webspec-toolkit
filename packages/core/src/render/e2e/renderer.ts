/**
 * E2ERenderer — pure function: WorkflowRecording → Playwright `.spec.ts` source.
 *
 * Deterministic. Goldenable. No file I/O. No LLM in the loop — this is the
 * v0.7.0 happy-path renderer. Amplification (negative scenarios, assertions
 * inferred by the LLM) lands in v0.7.2 as a second pass over the same input.
 *
 * Locator strategy:
 *   role=foo[name="bar"]       → page.getByRole('foo', { name: 'bar' })
 *   text="bar"                  → page.getByText('bar')
 *   [data-testid="bar"]         → page.getByTestId('bar')
 *   anything else               → page.locator('<raw selector>')
 *   <preferred> >> nth=N        → <above> .nth(N)
 *
 * Falling back to `page.locator(...)` for unparseable strategies (e.g. CSS
 * with classes, or testId variants like `data-cy`) is intentional — Playwright
 * accepts the raw selector string anyway. Doing it idiomatically when we can
 * is a readability nicety, not correctness.
 *
 * See `docs/06-renderer.md` for the locked action and assertion sets, the
 * navigate.reason mapping, and the v0.7.x sequence.
 */
import type { HardenedSelector, RecordedEvent, WorkflowRecording } from '../../types/analysis.js';

export interface RenderE2EOptions {
  /** Title used for the deterministic `test()` block. Defaults to "recorded workflow". */
  testName?: string;
}

export function renderPlaywrightSpec(
  recording: WorkflowRecording,
  opts: RenderE2EOptions = {},
): string {
  const testName = opts.testName ?? 'recorded workflow';
  const lines: string[] = [];

  lines.push("import { expect, test } from '@playwright/test';");
  lines.push('');
  lines.push(`test(${quote(testName)}, async ({ page }) => {`);
  lines.push(`  await page.goto(${quote(recording.startUrl)});`);

  for (const event of recording.events) {
    const rendered = renderEvent(event);
    for (const line of rendered) lines.push(`  ${line}`);
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Map a single RecordedEvent to one or more Playwright source lines.
 * Returns `[]` for events outside the v0.7.0 action set (defensive — the
 * schema currently has no such events, but the discriminated union may
 * grow before the renderer catches up).
 */
function renderEvent(event: RecordedEvent): string[] {
  switch (event.kind) {
    case 'click':
      return [`await ${locator(event.selector)}.click();`];

    case 'input':
      return [
        `await ${locator(event.selector)}.fill(${quote(event.value)});`,
      ];

    case 'keydown':
      // Selector is optional on keydown — when the target wasn't an Element
      // (e.g. window-level shortcut), fall back to the page keyboard.
      if (event.selector !== undefined) {
        return [
          `await ${locator(event.selector)}.press(${quote(event.key)});`,
        ];
      }
      return [`await page.keyboard.press(${quote(event.key)});`];

    case 'change':
      return renderChange(event);

    case 'submit':
      // `submit` is captured for the audit trail but Playwright doesn't have a
      // dedicated submit primitive — the preceding click/keydown already
      // triggered the form. Leave a comment so the developer can add
      // `page.waitForLoadState()` or an assertion if they care.
      return [`// form submit observed on ${event.selector.preferred}`];

    case 'navigate':
      return renderNavigate(event);

    case 'assertObserved':
      // v0.7.0 scope: not used. The amplifier (v0.7.2) will produce these via
      // the IR's typed assertions, not directly into the recorder timeline.
      return [];

    default: {
      // Exhaustiveness check — narrows `event` to `never` if all kinds handled.
      const _exhaustive: never = event;
      void _exhaustive;
      return [];
    }
  }
}

function renderChange(event: Extract<RecordedEvent, { kind: 'change' }>): string[] {
  // Selects carry an `options` array (v0.6.1). Checkbox/radio events don't.
  if (event.options !== undefined) {
    return [
      `await ${locator(event.selector)}.selectOption(${quote(event.value)});`,
    ];
  }
  // Checkbox / radio: value is 'true' | 'false' (see content-script handleChange).
  const verb = event.value === 'true' ? 'check' : 'uncheck';
  return [`await ${locator(event.selector)}.${verb}();`];
}

function renderNavigate(event: Extract<RecordedEvent, { kind: 'navigate' }>): string[] {
  switch (event.reason) {
    case 'reload':
      return ['await page.reload();'];
    case 'navigate':
      return [`await page.waitForURL(${quote(event.url)});`];
    case 'history':
    case 'hash':
      // SPA route change — the preceding click did the navigation. Assert it
      // landed where we expected. (URL assertion, not action.)
      return [`await expect(page).toHaveURL(${quote(event.url)});`];
    default: {
      const _exhaustive: never = event.reason;
      void _exhaustive;
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Locator translation
// ---------------------------------------------------------------------------

/** Match Playwright's role selector form: `role=tag[name="..."]`. */
const ROLE_RE = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\]$/;
/** Match Playwright's text selector form: `text="..."`. */
const TEXT_RE = /^text="((?:[^"\\]|\\.)*)"$/;
/** Match a data-testid CSS attribute selector (the canonical Playwright testId). */
const TESTID_RE = /^\[data-testid="((?:[^"\\]|\\.)*)"\]$/;
/** Pull off the `>> nth=N` suffix introduced by v0.5.1 disambiguation. */
const NTH_SUFFIX_RE = /^(.*?)\s*>>\s*nth=(\d+)$/;

/**
 * Turn a HardenedSelector into a Playwright locator expression — the part that
 * goes between `await ` and `.click()` (or `.fill()` etc.). Idiomatic
 * `getBy*` form when the selector matches a known Playwright strategy;
 * falls back to `page.locator(rawSelector)` otherwise.
 */
function locator(selector: HardenedSelector): string {
  const { base, nth } = splitNth(selector.preferred);
  const expr = baseExpr(base, selector.strategy);
  return nth === null ? expr : `${expr}.nth(${nth})`;
}

function splitNth(preferred: string): { base: string; nth: number | null } {
  const match = NTH_SUFFIX_RE.exec(preferred);
  if (match === null) return { base: preferred, nth: null };
  return { base: match[1]!, nth: Number.parseInt(match[2]!, 10) };
}

function baseExpr(base: string, strategy: HardenedSelector['strategy']): string {
  if (strategy === 'role') {
    const m = ROLE_RE.exec(base);
    if (m !== null) {
      const role = m[1]!;
      const name = unescapeDoubleQuotes(m[2]!);
      return `page.getByRole(${quote(role)}, { name: ${quote(name)} })`;
    }
  }
  if (strategy === 'text') {
    const m = TEXT_RE.exec(base);
    if (m !== null) {
      const text = unescapeDoubleQuotes(m[1]!);
      return `page.getByText(${quote(text)})`;
    }
  }
  if (strategy === 'testId') {
    const m = TESTID_RE.exec(base);
    if (m !== null) {
      const id = unescapeDoubleQuotes(m[1]!);
      return `page.getByTestId(${quote(id)})`;
    }
  }
  // CSS fallback, or a strategy we couldn't pattern-match (e.g. `data-cy`
  // testId variant — Playwright still accepts it as a locator string).
  return `page.locator(${quote(base)})`;
}

function unescapeDoubleQuotes(value: string): string {
  return value.replace(/\\"/g, '"');
}

// ---------------------------------------------------------------------------
// String literal quoting
// ---------------------------------------------------------------------------

/**
 * Quote a string for emission as a JavaScript/TypeScript literal. Single
 * quotes when the string is plain ASCII without specials (most of the time —
 * matches Playwright Codegen's style); JSON.stringify otherwise so escapes
 * are correct without us reimplementing them.
 */
function quote(value: string): string {
  if (/^[\x20-\x26\x28-\x5b\x5d-\x7e]*$/.test(value) && !value.includes("'")) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
}
