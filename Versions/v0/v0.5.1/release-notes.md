# v0.5.1 — Hardened Recorder Selectors (2026-05-11)

## Problem

v0.5.0 broadened the recorder's event capture but every selector still used the basic CSS strategy (`tag#id.class`). On real pages that produces selectors like:

```json
{ "preferred": "a", "strategy": "css", "fallbacks": [] }
```

— matching every anchor on the page, useless for replay. The TodoMVC smoke at v0.5.0 surfaced this directly: all three filter links recorded as just `"a"`, surviving only because `targetText` was unique. M6's Playwright renderer can't produce reliable specs from selectors that brittle, so this had to land before we move on.

Re-running the smoke against the first cut of hardened selectors surfaced two more problems that had to land in the same version:

1. **Per-keystroke noise.** Typing `"buy a cat"` into the new-todo input produced nine separate `input` events (one per character) plus a focusing `click`, and toggling a checkbox produced both a redundant `click` and the meaningful `change` — a 35-event recording for an 11-action walkthrough.
2. **Ambiguous selectors.** TodoMVC has three checkboxes all named "Toggle Todo". The role+name strategy collapsed them to one identical selector, so toggling different todos was indistinguishable in the recording.

## Solution

Hardened-selector synthesis at capture time, matching Playwright's own codegen priority order:

1. **`data-testid`** (plus `data-test-id`, `data-test`, `data-cy`, `data-qa` variants) → `strategy: 'testId'`. Most stable: only changes if a dev deliberately renames the attribute.
2. **ARIA role + accessible name** → `strategy: 'role'`. Survives markup restructuring as long as user-visible semantics stay constant. Playwright's recommended default.
3. **Visible text** → `strategy: 'text'`. Survives until the copy changes.
4. **Basic CSS** → `strategy: 'css'`. Last resort, what we shipped in v0.5.0.

Each `HardenedSelector` carries a `preferred` string in Playwright's own selector engine syntax (`role=link[name="Active"]`, `text="Active"`, `[data-testid="…"]`) and a `fallbacks[]` array of weaker alternatives. M6's renderer pattern-matches the prefix to emit the right `getByRole` / `getByText` / `locator` form; if the preferred selector misses at replay, the renderer (or a future replay UI) can degrade through the fallbacks.

The accessible-name computation implements a pragmatic subset of the W3C Accessible Name spec:

- `aria-labelledby` (resolves the points-to chain, joins textContent)
- `aria-label`
- `<label for>` and wrapping `<label>` association for form controls (via `el.labels`)
- `placeholder` and `title` fallback for inputs
- `textContent` for buttons and links (per spec, the visible text *is* the name)

Names are normalized (whitespace collapsed) and truncated to 80 chars so we don't bake war-and-peace strings into recordings.

**Disambiguation.** When the preferred selector matches more than one element on the page (TodoMVC's three "Toggle Todo" checkboxes, identical CSS fallbacks, etc.), we append a Playwright `>> nth=N` positional suffix to the preferred string so each event uniquely targets its element. Applied to `testId`, `role`, and `css` strategies. Deliberately *not* applied to `text` strategy: text content bubbles through ancestors (a link's text matches its parent `<ul>` too), so an nth suffix there could mis-target on replay.

**Event dedup at capture time.** Three rules collapse multi-event browser sequences into the single user action they represent:

- **Coalesce contiguous keystrokes.** Successive `input` events on the same field (same `selector.preferred`) merge into one event holding the final value. Any intervening event (Enter, Tab, click elsewhere) breaks the run — the next typing session starts fresh.
- **Drop the focusing click.** A `click` immediately followed by an `input` on the same selector is dropped: Playwright's `fill()` focuses on its own.
- **Drop the redundant toggle click.** A checkbox/radio click fires both `click` and `change` events on the same element within milliseconds. The `change` carries the new checked state, so the preceding `click` is dropped — one physical action yields one recorded event.

End-to-end effect on the TodoMVC smoke: a recording that produced 35 events in the v0.5.1 first cut now produces 14 — and the 14 are all meaningful.

## New

- `buildHardenedSelector(el: Element): HardenedSelector` in `packages/chrome-extension/src/content-script/selectors.ts`.
- Helper functions: `findTestId`, `computeRole`, `computeAccessibleName`, `visibleText`, `collectFallbacks`.
- `disambiguateRole` and `disambiguateCss` helpers — append `>> nth=N` when a preferred selector matches multiple elements on the page.
- `IMPLICIT_ROLES` and `IMPLICIT_INPUT_ROLES` tables mapping common HTML tags / input types to ARIA roles.
- 21 hardened-selector tests in `packages/chrome-extension/tests/selectors.test.ts` using `happy-dom`.
- `happy-dom` workspace devDep for DOM-aware tests (lighter than jsdom; Node 18-compatible).
- `tests/` added to `packages/chrome-extension/tsconfig.json` include list.

## Changed

- `packages/chrome-extension/src/content-script/index.ts` — `selectorFor` now returns a full `HardenedSelector` via `buildHardenedSelector`. Three dedup rules added to event handlers: contiguous `input` events on the same field coalesce into one, a `click` followed by `input` on the same selector is dropped (focus is redundant under `fill()`), and a `click` immediately preceding a `change` on a checkbox/radio is dropped (one physical action → one event). Module docstring refreshed to reflect the new scope.
- `packages/chrome-extension/src/popup/App.tsx` — footer label bumped.
- Public surface of `selectors.ts` — `buildBasicSelector` is still exported as the css-strategy implementation, but the recorder no longer calls it directly.

## Fixed

- TodoMVC-style filter links no longer record as the unparseable `"a"` selector. The new-todo input no longer records as `"input.new-todo"` (which would break the moment a CSS module renames the class) — it records as `role=textbox[name="What needs to be done?"]`, which Playwright can resolve via `getByRole` and will survive class renames and wrapper-div refactors.
- The toggle checkbox at `input.toggle` similarly becomes `role=checkbox[name="<associated label>"]`, decoupling the recording from a stylesheet-internal class name.
- Identical role+name selectors no longer collapse multiple distinct elements into one. Toggling todo 1 vs. todo 2 in TodoMVC now produces `role=checkbox[name="Toggle Todo"] >> nth=0` vs. `>> nth=1` rather than two identical strings.
- Typing a sentence into a form field no longer produces one event per keystroke — the recording stores the final value as a single `input` event.
- Toggling a checkbox no longer produces a duplicate `click` + `change` pair — only the state-bearing `change` event survives.

## Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/content-script/selectors.ts` | Add hardened-selector synthesis (testId / role+name / text / css priority order) with `>> nth=N` disambiguation for non-unique selectors. Keep `buildBasicSelector` as the css-strategy primitive. |
| `packages/chrome-extension/src/content-script/index.ts` | Recorder now calls `buildHardenedSelector`; add input-coalescing, focus-click, and toggle-click dedup rules. Refresh module docstring to v0.5.1 scope. |
| `packages/chrome-extension/src/popup/App.tsx` | Footer label → v0.5.1. |
| `packages/chrome-extension/tests/selectors.test.ts` | 21 new tests covering priority order, accessible-name sources, implicit roles, text normalization. |
| `packages/chrome-extension/tsconfig.json` | Include `tests/**/*` so the editor type-checks tests. |
| `package.json` | Add `happy-dom` workspace devDep. |
| `Versions/v0/v0.5.1/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **147/147 tests pass** (126 prior + 21 new selector tests), library build clean, extension Vite bundle clean (~590 KB content-script bundle, ~3 KB larger than v0.5.0 — the cost of the role/name computation).

### Live smoke

1. `make ext-build` (or `make ci`).
2. Reload the webspec card in `chrome://extensions`.
3. Hard reload `https://demo.playwright.dev/todomvc` (Cmd+Shift+R).
4. Click **Record workflow** → type a todo, press Enter, check it off, click the **Active** filter, click **Clear completed** → **■ Stop recording**.
5. Open the downloaded `recording-*.json`. Look at the selectors — every selector with text content should now carry `strategy: 'role'` or `'text'`, with `preferred` like:
   - `role=textbox[name="What needs to be done?"]` (the new-todo input)
   - `role=checkbox[name="Toggle Todo"] >> nth=0` (the first toggle)
   - `role=link[name="Active"]` / `role=link[name="Completed"]` (the filter links)
   - `role=button[name="Clear completed"]` (the clear button)
6. **`fallbacks` arrays** should be populated for non-css strategies — the renderer at M6 will use these if the preferred selector misses.
7. **Event count.** A walkthrough of "type three todos, toggle two, click Active / Completed / Clear completed" produces ~14 events — one `input` per todo (final value), one `change` per toggle (no duplicate `click`), and one `click` per navigation. Per-keystroke noise (~30 events for the typing alone) is gone.

### What's still open in M5 (in order)

- **v0.5.2** — Navigation event capture + state persistence in `chrome.storage.session`.
- **v0.5.3** — Trace summary preview in popup + "review before sharing" warning; network capture if we want it in M5 (debatable; could defer to M6-enables).
- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.
