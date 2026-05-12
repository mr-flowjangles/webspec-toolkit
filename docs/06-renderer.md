# 06 — M6 E2E renderer

How a `WorkflowRecording` becomes a runnable Playwright `.spec.ts`. This doc is authoritative for `packages/core/src/render/e2e/` (M6 implementation) and `packages/cli/src/commands/record-to-spec.ts`.

## Architecture recap

M6 is **Phase 2** of the contract artifact pattern (`02-contract-spec.md`): the recorder produces a `WorkflowRecording` in Phase 1; the renderer consumes it in Phase 2. Same pattern as M2 (TestPlan → Jest source) and M4 (A11yReport → Markdown), but the IR is e2e-shaped.

Two passes:

- **Deterministic pass.** Walks the `WorkflowRecording`'s `events[]` and emits Playwright actions / assertions one-for-one. Always works; no LLM in the loop. Output is one Playwright `test()` block — the recorded happy path.
- **LLM amplification pass.** Given the same recording, the LLM emits a typed `AmplifiedRecording` (Path C — see `99-open-questions.md`): an array of `scenarios[]` each with `kind: 'happy' | 'negative'`, typed `actions[]`, typed `assertions[]`. A deterministic formatter turns that into additional `test()` blocks. Skipped if no provider is configured.

The LLM never writes Playwright source directly. The structured IR is the validation seam.

## Locked decisions (v0.6.2)

These are the design decisions reached during the v0.6.2 planning walk-through. They constrain the v0.7.x implementation.

### Action set

The deterministic pass and the IR support six Playwright actions:

| IR action | Playwright primitive | Source event(s) |
|---|---|---|
| `click` | `page.click(selector)` | `RecordedEvent.kind === 'click'` |
| `fill` | `page.fill(selector, value)` | `RecordedEvent.kind === 'input'` |
| `press` | `page.press(selector, key)` | `RecordedEvent.kind === 'keydown'` |
| `goto` | `page.goto(url)` | first event of every test (from `WorkflowRecording.startUrl`) |
| `reload` | `page.reload()` | `RecordedEvent.kind === 'navigate' && reason === 'reload'` |
| `waitForURL` | `page.waitForURL(url)` | `RecordedEvent.kind === 'navigate' && reason === 'navigate'` |

Two implicit Playwright primitives derive from `change` events without being first-class IR actions:

- `change` on `<input type="checkbox" \| radio>` → `page.check(selector)` / `uncheck(selector)` based on the captured `value`.
- `change` on `<select>` → `page.selectOption(selector, value)`. The `options[]` field (v0.6.1) is metadata; the deterministic pass doesn't need it, but the amplifier uses it for negative scenarios.

**Out of v1 scope:** `dblclick`, `hover`, `drag`, `focus`/`blur`, `setInputFiles`. Add when a real recording asks for one.

### Assertion set

The IR's `assertions[]` supports seven Playwright matchers:

| IR assertion | Playwright |
|---|---|
| `visible` | `await expect(locator).toBeVisible()` |
| `hidden` | `await expect(locator).toBeHidden()` |
| `text` (with `equals` \| `contains` mode) | `toHaveText(s)` or `toContainText(s)` |
| `url` | `await expect(page).toHaveURL(url)` |
| `count` | `await expect(locator).toHaveCount(n)` |
| `value` | `await expect(locator).toHaveValue(v)` |
| `checked` | `await expect(locator).toBeChecked()` |

**Out of v1 scope:** `attribute`, `title`, `enabled`/`disabled`, `focused`. Same rule — add when needed.

### `navigate.reason` → renderer mapping

The recorder tags `navigate` events with a `reason` (v0.5.3). Each reason maps to a different Playwright shape:

| Reason | Maps to | Why |
|---|---|---|
| `navigate` (cross-document) | `await page.waitForURL(url)` | The preceding action triggered the navigation; we wait for confirmation rather than re-issuing it. |
| `reload` | `await page.reload()` | Explicit user action with a Playwright counterpart. |
| `history` (`pushState` / `replaceState`) | `await expect(page).toHaveURL(url)` | SPA route change. The click that triggered it is already rendered; we assert the URL changed. |
| `hash` (fragment-only) | `await expect(page).toHaveURL(url)` | Same as history — no Playwright action to "do" a hash change. |

The asymmetry is deliberate: `navigate` and `reload` produce **actions**; `history` and `hash` produce **assertions**. The IR shape allows both — a single `RecordedEvent` may emit either an action or an assertion in the rendered spec.

### Integration test target

Hermetic local fixture, not a hosted site. Hand-written HTML under `tests/fixtures/playwright-target/` (e.g., `form.html`, `dropdown.html`, `nav.html`), loaded via `file://` URLs. No build step, no server, no network dependency.

Why local: a hosted demo (TodoMVC and similar) brings state drift, occasional downtime, and unrelated DOM churn. The integration test exists to assert "render produces a runnable spec," not "external site still works." Real-world recordings stay validated through the v0.6.0 manual three-site verification, not CI.

A hosted-site smoke can be added as an opt-in integration suite when a real reason emerges.

### Ambiguous selectors

The renderer emits **every event** with its `selector.preferred` exactly as captured. No skipping, no warning comments, no heuristic detection of ambiguity. Same model as Playwright Codegen — the recording is the user's authored intent; the renderer just renders it.

Where selector quality is genuinely a problem (e.g. the v0.5.1 stray-click-on-`<ul.filters>` case), the fix lives upstream in `selectors.ts`, not in the renderer.

## IR shape — `AmplifiedRecording`

Lives next to `WorkflowRecording` in `packages/core/src/types/analysis.ts`. Not a fourth `Analysis` variant; it's an intermediate produced by the M6 amplifying analyzer and consumed by the M6 renderer. User-facing artifacts stay `WorkflowRecording` (capture) and the rendered `.spec.ts` (output).

Sketch (zod schema lands in v0.7.1; the final field names may shift):

```ts
type AmplifiedRecording = {
  scenarios: Array<{
    kind: 'happy' | 'negative';
    name: string;            // test() title
    description?: string;    // optional Playwright test.describe / comment
    actions: Action[];
    assertions: Assertion[];
  }>;
};

type Action =
  | { kind: 'click'; selector: HardenedSelector }
  | { kind: 'fill'; selector: HardenedSelector; value: string }
  | { kind: 'press'; selector: HardenedSelector; key: string }
  | { kind: 'goto'; url: string }
  | { kind: 'reload' }
  | { kind: 'waitForURL'; url: string }
  | { kind: 'selectOption'; selector: HardenedSelector; value: string }
  | { kind: 'check' | 'uncheck'; selector: HardenedSelector };

type Assertion =
  | { kind: 'visible' | 'hidden'; selector: HardenedSelector }
  | { kind: 'text'; selector: HardenedSelector; mode: 'equals' | 'contains'; value: string }
  | { kind: 'url'; value: string }
  | { kind: 'count'; selector: HardenedSelector; value: number }
  | { kind: 'value'; selector: HardenedSelector; value: string }
  | { kind: 'checked'; selector: HardenedSelector };
```

`selector` carries the full `HardenedSelector` (with `preferred`, `strategy`, `fallbacks[]`) so a future Playwright runtime that can degrade to fallbacks has the data. The deterministic renderer uses `selector.preferred` by default.

## Two-pass output

**Deterministic-only output (no LLM provider configured):**

```ts
import { test, expect } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('https://example.com');
  await page.fill('role=textbox[name="What needs to be done?"]', 'buy milk');
  await page.press('role=textbox[name="What needs to be done?"]', 'Enter');
  await page.click('role=link[name="Active"]');
  await expect(page).toHaveURL('https://example.com/#/active');
});
```

**Amplified output (provider configured):**

Same `test()` block plus one or more additional `test()` blocks generated from the LLM's `AmplifiedRecording.scenarios[]` where `kind === 'negative'`. Examples the amplifier might emit:

- "rejects empty submission" — same actions minus the fill, plus `expect(errorMessage).toBeVisible()`.
- "rejects too-long input" — fill with a value beyond the field's likely max, assert error.
- "preserves state across reload" — happy path, then `page.reload()`, then assertions on the persisted state.

The amplifier's prompt constrains it to plausible variants only — not exhaustive fuzzing. v1 ships with a small fixed set of negative archetypes; expanding it is a prompt change, not a renderer change.

## What v1 explicitly does not do

- **Visual diffing / screenshot assertions.** Out — different problem class.
- **Network mocking from recorded requests.** Out — the recorder doesn't capture response bodies in v1.
- **Multi-select (`<select multiple>`).** Out — recorder captures single-select only as of v0.6.1; multi-select adds a renderer surface (array values, assertion shape) we defer until a real recording needs it.
- **Playback inside the Chrome extension.** Out — recordings render to `.spec.ts`; users run them like any other Playwright spec.
- **Cypress, Jasmine, Karma alternatives.** Out — see `99-open-questions.md` for the framework-rationale.

## Implementation sequence (v0.7.x)

- **v0.7.0** — Deterministic pass only. `RecordedEvent` → Playwright action mapping + `webspec record-to-spec` CLI. Runs without an LLM provider. Happy-path spec emits and runs against the local fixture.
- **v0.7.1** — Define `AmplifiedRecording` zod schema in `@webspec/core`. No LLM call yet; just the types and zod validation, plus a hand-written golden fixture.
- **v0.7.2** — Wire the LLM amplifier. Prompt design + Bedrock call + validated response. Renderer extension formats the negative scenarios.
- **v0.7.3** — Integration test against `tests/fixtures/playwright-target/`. Spec compiles and the happy-path test passes.
- **v1.0.0** — M6 done = v1 done.
