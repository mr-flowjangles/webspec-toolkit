# v0.7.0 — M6 Deterministic Renderer (2026-05-12)

## Problem

M5 closed with a recorder that produces typed `WorkflowRecording` JSON files — hardened selectors, dedup, navigation events, session persistence, all in. But the recordings were dead-ends. There was no way to turn a `recording.json` into a runnable test. M6 exists to close that loop: capture a workflow once, render a Playwright spec from it.

The design doc (`docs/06-renderer.md`, v0.6.2) settled the contract: deterministic pass first, LLM amplification later (v0.7.2), structured `AmplifiedRecording` IR in between. v0.7.0 ships the first piece — the deterministic pass — so the loop closes end-to-end even when no LLM is configured.

## Solution

Three pieces, all in this version:

**`renderPlaywrightSpec(recording, opts?)`** — a pure `WorkflowRecording → string` function in `packages/core/src/render/e2e/renderer.ts`. Browser-safe (string ops only; no Node deps). Mapping is exactly what `06-renderer.md` locked:

| Recorder event | Playwright |
|---|---|
| start (every recording) | `page.goto(startUrl)` |
| `click` | `locator.click()` |
| `input` | `locator.fill(value)` |
| `keydown` (with selector) | `locator.press(key)` |
| `keydown` (without selector) | `page.keyboard.press(key)` |
| `change` on checkbox/radio (`value: 'true'`) | `locator.check()` |
| `change` on checkbox/radio (`value: 'false'`) | `locator.uncheck()` |
| `change` on `<select>` (carries `options`) | `locator.selectOption(value)` |
| `submit` | `// form submit observed on <selector>` (Playwright has no submit primitive; the preceding click/keydown already triggered it) |
| `navigate` reason `reload` | `page.reload()` |
| `navigate` reason `navigate` | `page.waitForURL(url)` |
| `navigate` reason `history` / `hash` | `await expect(page).toHaveURL(url)` |

Locator translation matches Playwright Codegen's idiom: `role=button[name="Save"]` becomes `page.getByRole('button', { name: 'Save' })`, `text="Sign in"` becomes `page.getByText('Sign in')`, `[data-testid="x"]` becomes `page.getByTestId('x')`. Everything else falls back to `page.locator(rawSelector)`. The v0.5.1 `>> nth=N` disambiguator is stripped from the selector and chained as `.nth(N)` on the locator. String literals quote with single quotes when the value is plain ASCII without specials; fall back to `JSON.stringify` otherwise so escapes are correct.

**`webspec record-to-spec <recording.json>` CLI command** — `packages/cli/src/commands/record-to-spec.ts`. Reads the file, validates against `WorkflowRecordingSchema` (zod), renders, writes the spec next to the input by default (`recording.json` → `recording.spec.ts`) or to `--out` if given. `--test-name` overrides the default `test()` title. Validation failure returns exit 2 (caller-side); FS / runtime errors return exit 1.

**Golden tests** — 24 in `packages/core/tests/render/e2e/renderer.test.ts` covering every locator strategy, every event kind, every `navigate.reason`, string-quoting edge cases (single quotes, newlines), and a full TodoMVC-shaped fixture. 8 more in `packages/cli/tests/args.test.ts` for the new command's argument parser. 179/179 tests pass workspace-wide.

## New

- `packages/core/src/render/e2e/renderer.ts` — `renderPlaywrightSpec(recording: WorkflowRecording, opts?: RenderE2EOptions): string` plus internal helpers (`renderEvent`, `renderChange`, `renderNavigate`, `locator`, `baseExpr`, `splitNth`, `quote`).
- `packages/cli/src/commands/record-to-spec.ts` — `runRecordToSpec(cmd)` + `RecordToSpecInputError` for caller-side validation failures.
- `packages/cli/tests/args.test.ts` — 8 tests for the `record-to-spec` argument parser.
- `packages/core/tests/render/e2e/renderer.test.ts` — 24 golden tests across 5 describe blocks (header & scaffold, locator strategies, actions, navigation reasons, string quoting) plus a full fixture covering an in-order TodoMVC walkthrough.

## Changed

- `packages/core/src/index.ts` — export `renderPlaywrightSpec` and `RenderE2EOptions` from the Node entry point.
- `packages/core/src/browser.ts` — same exports for the Chrome bundle.
- `packages/cli/src/args.ts` — `ParsedArgs` widened with `RecordToSpecCommand`; new `parseRecordToSpec` sub-parser. Help text updated to document the new command + `--test-name` flag.
- `packages/cli/src/index.ts` — dispatch the new `'record-to-spec'` case; map `RecordToSpecInputError` to exit 2.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/e2e/renderer.ts` | New — deterministic renderer (`WorkflowRecording` → Playwright `.spec.ts` source). |
| `packages/core/tests/render/e2e/renderer.test.ts` | New — 24 golden tests covering the full event/strategy/reason matrix. |
| `packages/core/src/index.ts` | Export `renderPlaywrightSpec` + `RenderE2EOptions`. |
| `packages/core/src/browser.ts` | Same, for the browser bundle. |
| `packages/cli/src/commands/record-to-spec.ts` | New — `webspec record-to-spec` implementation with zod validation gate. |
| `packages/cli/src/args.ts` | Parse `record-to-spec` subcommand; extend `HELP_TEXT`. |
| `packages/cli/src/index.ts` | Dispatch the new subcommand; map input errors to exit 2. |
| `packages/cli/tests/args.test.ts` | 8 new tests for the `record-to-spec` arg parser. |
| `Versions/v0/v0.7.0/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: **179/179** tests pass (147 prior + 24 e2e renderer + 8 record-to-spec arg-parser). Type-check clean across `core` and `cli`. CLI builds clean.

### End-to-end smoke

Two real-recording smokes pass:

**Select recording (v0.6.1 verification artifact).** A 3-event recording of three dropdown selections renders to:

```ts
import { expect, test } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('http://localhost:8765/select-test.html');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('ca');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('mx');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('us');
});
```

**Synthetic login + nav fixture.** A 7-event recording covering fill (with masked password), click, all three navigation reasons, and a hash-routing assertion renders to:

```ts
import { expect, test } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('https://example.com/dashboard');
  await page.reload();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('https://example.com/dashboard/#/settings');
});
```

**Bad-input rejection.** `webspec record-to-spec` against a file that's valid JSON but not a `WorkflowRecording` exits with code 2 and prints the zod validation error pointing at the missing fields.

## What's next

- **v0.7.1** — Define the `AmplifiedRecording` zod schema in `@webspec/core` (`scenarios[]` with typed `actions[]` + `assertions[]`). No LLM yet; just the IR and zod validation, plus a hand-written golden fixture.
- **v0.7.2** — Wire the LLM amplifier. Prompt + Bedrock call + validated response → renderer extension that emits the negative scenarios as additional `test()` blocks.
- **v0.7.3** — Integration test. Local fixture under `tests/fixtures/playwright-target/`; spec compiles and the happy-path test passes against the fixture via the Playwright runner.
- **v1.0.0** — M6 done = v1 done.
