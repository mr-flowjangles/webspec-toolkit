# v0.5.0 — Recorder Events + Best Practice Rules (2026-05-11)

## Problem

Three gaps after v0.4.2:

1. **The recorder only captured clicks.** A real workflow — fill a form, hit a select, press Enter to submit — produced an event trace with just the clicks, missing the field values and the submit. Useless to M6 (Playwright rendering).
2. **The audit ran WCAG 2.1 AA + Section 508, but dropped axe's `best-practice` tag at the contract boundary.** That excluded ~30 hygiene rules that human a11y reviewers tend to flag too: `landmark-one-main`, `region`, `page-has-heading-one`, `heading-order`, etc. Easy automated coverage we were leaving on the floor.
3. **The popup couldn't stop an in-progress recording.** Chrome popups are transient — they unmount when you click away. The popup's React state reset to `idle` on every reopen, even though the content-script recorder was still capturing. The "Stop recording" button label never appeared because the popup didn't know it was recording. Effectively: you could start a recording but never end it without reloading the page. Shipped that way since v0.4.1; surfaced during v0.5.0 smoke.

## Solution

Two cosmetic-feeling changes; one is real plumbing.

**Recorder broadens to five event types** (`click` already shipped; `input`, `change`, `submit`, `keydown` are new). Each routes through one capture-phase listener that pushes a typed `RecordedEvent` variant. Password fields auto-mask (value blanked, `sensitive: true`). `keydown` filters to workflow-significant keys only (Enter/Tab/Escape/Arrows/Page/Home/End) — character typing flows through `input` instead, so we don't double-capture.

**axe-core gets the `best-practice` tag added** to the input set, and `best-practice` becomes a first-class rule-set tag in the contract. Renderers (both the markdown one and the report-tab one) surface a "Best practice" badge wherever WCAG and 508 badges already render. Zero per-audit cost; the rules were already there in axe — we just stopped throwing them away.

**Vision-based alt-text quality is NOT in this PR.** Considered it, weighed it against the cost-per-audit math (real money per scan once we add a multimodal call), and decided to bank it for a future Pro tier. Documented in `docs/99-open-questions.md` so it's not lost.

**Popup state rehydrates from the content script.** New `recorder:status` message: the popup sends it on mount, the content script returns whether a recording is in progress (+ `startedAt`, `startUrl`, current `eventCount`). If recording, the popup hydrates React state to `kind: 'recording'` so the button reads "■ Stop recording" and the banner shows. Without this, the v0.5.0 broader event capture would have been unreachable in practice.

## New

- `'best-practice'` value on `A11yRuleTagSchema` enum; `DEFAULT_A11Y_TAGS` and `SURFACED_TAGS` both include it.
- Content-script handlers: `handleInput`, `handleChange`, `handleSubmit`, `handleKeydown` with selector helper `selectorFor`.
- `SIGNIFICANT_KEYS` constant defining which keydown events get captured.
- `recorder:status` message + `getRecorderStatus()` in the content script; `hydrateRecorderStatus()` helper in the popup that runs once on mount.
- Open-questions entry parking vision-based alt-text / link-text / heading-outline LLM checks as a post-v1 Pro tier feature.

## Changed

- `packages/core/src/types/analysis.ts` — `A11yRuleTagSchema` widened to include `'best-practice'`; docstring updated.
- `packages/core/src/analyze/a11y/analyzer.ts` — `DEFAULT_A11Y_TAGS` includes `'best-practice'`.
- `packages/core/src/analyze/a11y/normalize.ts` — `SURFACED_TAGS` includes `'best-practice'`; docstring updated.
- `packages/core/src/render/a11y/renderer.ts` — `humanizeRuleSets` maps `'best-practice'` → "Best practice".
- `packages/chrome-extension/src/content-script/index.ts` — adds `A11Y_TAGS` entry; adds input/change/submit/keydown listeners with start/stop wiring; rewrites the docstring to reflect v0.5.0 scope.
- `packages/chrome-extension/src/shared/messages.ts` — docstring + section comment refreshed to v0.5.0.
- `packages/chrome-extension/src/report/ReportPage.tsx` — `humanizeRuleSetsList` maps `'best-practice'` → "Best practice" badge.
- `packages/chrome-extension/src/popup/App.tsx` — `useEffect` on mount queries `recorder:status` to rehydrate React state from the content script; footer label bumped to v0.5.0.
- `packages/core/tests/analyze/a11y/normalize.test.ts` — expected `ruleSet.tags` includes `'best-practice'`; the "empty ruleSets" test rewritten to assert `['best-practice']`.
- `packages/core/tests/render/a11y/renderer.test.ts` — best-practice-only finding now renders the "Best practice" label, not an em-dash.
- `docs/99-open-questions.md` — new entry parking LLM-amplified a11y as Pro tier.

## Fixed

- **Recording is actually stoppable.** Pre-v0.5.0, closing the popup mid-recording reset the popup's React state to `idle` on next open — the "Stop recording" button label never reappeared even though the content script was still capturing. The new `recorder:status` round-trip rehydrates the popup from ground truth on mount, so the button correctly reads "■ Stop recording" and the recorder banner reappears. Reload-the-page was the only previous workaround, and it threw away all captured events.
- Form-fill workflows are now actually recordable. Pre-v0.5.0 the recorder dropped every keystroke and every select change; the resulting trace would replay as "click the Submit button on an empty form."
- Password values can't accidentally end up in a recording. `<input type="password">` masks the value at capture time and flags `sensitive: true` so the rendered Playwright spec can decide whether to use a fixture or prompt at runtime.
- Audit reports against typical sites will now show `landmark-one-main` / `region` / `page-has-heading-one` violations that pre-v0.5.0 the report claimed didn't exist — they were running in axe but being dropped before the contract.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Widen `A11yRuleTagSchema` to include `'best-practice'`; docstring. |
| `packages/core/src/analyze/a11y/analyzer.ts` | Add `'best-practice'` to `DEFAULT_A11Y_TAGS`; docstring. |
| `packages/core/src/analyze/a11y/normalize.ts` | Add `'best-practice'` to `SURFACED_TAGS`; docstring. |
| `packages/core/src/render/a11y/renderer.ts` | Map `'best-practice'` to "Best practice" label. |
| `packages/chrome-extension/src/content-script/index.ts` | Broaden recorder to input/change/submit/keydown; password masking; significant-key filter; tag list mirror; `recorder:status` handler with wall-clock + URL persistence. |
| `packages/chrome-extension/src/shared/messages.ts` | Update docstring; add `RecorderStatusRequest` / `RecorderStatusResponse` + type guard. |
| `packages/chrome-extension/src/report/ReportPage.tsx` | Surface "Best practice" badge. |
| `packages/chrome-extension/src/popup/App.tsx` | Hydrate recorder state from content script on mount; footer label → v0.5.0. |
| `packages/core/tests/analyze/a11y/normalize.test.ts` | Expectations updated for new tag set + ruleSets shape. |
| `packages/core/tests/render/a11y/renderer.test.ts` | Expectation: best-practice rule renders "Best practice" label, not em-dash. |
| `docs/99-open-questions.md` | Park LLM-amplified a11y as post-v1 Pro tier. |
| `Versions/v0/v0.5.0/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean.

### Live smoke

1. `make build && make ext-build` (or `make ci`).
2. Reload the webspec card in `chrome://extensions`.
3. Reload the target page (content scripts only re-inject on page load).
4. **Audit smoke:** audit a page known to fail a best-practice rule (anything without a `<main>` landmark or without a `<h1>`). The report should now include `landmark-one-main` / `page-has-heading-one` / etc., tagged with the **Best practice** badge. Pre-v0.5.0 these wouldn't appear at all.
5. **Recorder smoke:** click **Record workflow**, then on the page:
   - Fill a text input → expect `input` events with the typed value.
   - Tick a checkbox / select a radio → expect a `change` event with `value: 'true'`.
   - Pick something in a `<select>` → expect a `change` event with the option value.
   - Type a password into a `<input type="password">` → expect an `input` event with `value: ""` and `sensitive: true`.
   - Hit Enter inside a form → expect a `keydown` event with `key: 'Enter'` AND a `submit` event for the form.
   - Press Tab to move focus → expect a `keydown` event with `key: 'Tab'`.
6. **Close the popup mid-recording**, then reopen it. The button should now read **"■ Stop recording"** (not "Record workflow"), and the recording banner should be visible. Pre-fix it always reset to the "Record workflow" label.
7. Click **Stop recording** → the downloaded `recording-*.json` should contain all of the above events, in time order, with sensible CSS selectors.

### What's not in this PR (intentional)

- **`navigate` events.** Capturing SPA navigation needs `popstate` / `pushState` hooks and a separate handler for cross-document loads. Not needed yet for the first M6 spike since Playwright can re-derive URL changes from the trace context.
- **Hardened selectors** (`data-testid` > role+name > text > css). Still on `buildBasicSelector` for now; the selector strategy upgrade is a separate PR.
- **Network capture** and **state persistence across popup close**. Both pending; tracked in the M5 task list.
- **LLM-amplified a11y judgments.** Parked at `docs/99-open-questions.md` — feature flagged for a future Pro tier so it doesn't lock the baseline to a per-audit cost.
