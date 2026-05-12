# v0.6.1 — Capture Select Options (2026-05-12)

## Problem

The recorder captured `<select>` interactions as a `change` event with only the chosen `value`. The full option set the user was presented with — every `<option>` element with its value and label — was thrown away. That's fine for the deterministic M6 pass (Playwright's `selectOption(value)` just needs the value), but the M6 LLM amplifier needs the unchosen options to generate negative scenarios ("what if the user picked Mexico instead of Canada?"). Without the option set in the recording, the amplifier has no anchor for those scenarios beyond hallucinating one.

The first cut of the option-capture also surfaced a parallel issue: a single user selection on a native `<select>` was producing three events in the recording (pre-click → change → post-click), because the v0.5.1 dedup rule that drops `click` events around `change` only covered checkbox/radio. Three events per selection is noisy enough that a renderer would have to filter clicks itself.

## Solution

**Option capture.** The `change` event in `RecordedEvent` gains an optional `options: { value, label }[]` field, populated only when the target is a `<select>`. The content script reads `select.options` at the moment of change and stores each `<option>`'s `value` plus trimmed `textContent` as the label. Single-select only for v0.6.1 — `<select multiple>` is rare in workflow recordings and adds a renderer surface (array of values) better handled when the renderer actually needs it. Optgroups are flattened; disabled options are still captured (they're part of the visible UI even when unselectable).

**Select-dedup symmetry.** The dedup rule already in `handleChange` for checkbox/radio (drop the preceding click on the same selector) now applies to `<select>` too. And `handleClick` gained the inverse case: a native `<select>` fires its `change` event *before* the `click` finishes bubbling from the chosen option, so the click arrives *after* the change. Same physical action, two events — we drop the trailing click. Net result: one `change` event per selection. The dedup rules in the recorder doc comment now cover both orderings.

## New

- `options?: { value: string; label: string }[]` field on the `change` variant of `RecordedEventSchema` in `packages/core/src/types/analysis.ts`.
- `optionsFor(select)` helper in `packages/chrome-extension/src/content-script/index.ts` — maps a live `HTMLSelectElement` to the typed options array.

## Changed

- `packages/chrome-extension/src/content-script/index.ts` — `handleChange` populates `options` for `<select>` targets and applies the click-before-change dedup. `handleClick` drops a click on a `<select>` if the previous buffered event is a `change` on the same selector. Module docstring extended to cover the trailing-click case.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add optional `options` array to the `change` event schema. |
| `packages/chrome-extension/src/content-script/index.ts` | Capture `<select>` options at change time. Extend dedup to handle both pre- and post-change clicks on selects. |
| `Versions/v0/v0.6.1/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: 147/147 tests still pass (schema change is additive — `options` is optional). Type-check clean. Vite bundle clean.

### Live smoke

1. `pnpm build` in `packages/chrome-extension`.
2. Refresh the webspec card at `chrome://extensions/` (no manifest change).
3. Serve a select fixture: `python3 -m http.server 8765` from `/tmp` after `cat > /tmp/select-test.html <<'EOF' ... EOF` with a `<select id="country">` containing US/CA/MX options.
4. Open `http://localhost:8765/select-test.html`.
5. Click **Record workflow** → pick three different countries from the dropdown → Stop.
6. Open the downloaded JSON. Three `change` events, each with `value` set to the chosen value and `options` listing all three. **No `click` events.**

Sample (recorded during v0.6.1 verification):

```json
{ "kind": "change", "value": "ca", "options": [{"value":"us","label":"United States"}, {"value":"ca","label":"Canada"}, {"value":"mx","label":"Mexico"}] }
{ "kind": "change", "value": "mx", "options": [{...same three...}] }
{ "kind": "change", "value": "us", "options": [{...same three...}] }
```

## What's next

M6 starts. The IR action set is locked (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`); the assertion set, `navigate.reason` mapping, sample-app fixture, and ambiguous-selector policy are the remaining open questions, walked through one at a time before any v0.7.0 code.
