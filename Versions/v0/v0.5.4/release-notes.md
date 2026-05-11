# v0.5.4 — Trace Preview And Share Warning (2026-05-11)

## Problem

Stopping a recording immediately downloaded the JSON file. Users had no idea what they'd captured until they opened the file — they couldn't see at a glance how long it was, what kinds of events were in it, what URLs were touched, or whether anything they'd typed had been recorded. Worse, there was no chance to bail out: if they realized mid-flow they'd typed something they didn't want to share, the file was already on disk. The recorder needs to give users a deliberate review step before anything is written.

## Solution

Decouple Stop from Download. Clicking **■ Stop recording** now holds the recording in popup state and renders a summary panel. The panel shows duration, total event count with a per-kind breakdown, the URL trail (start URL plus every `navigate` event with its `reason` tag), and a warning callout reminding the user that what they typed is in the recording (passwords masked, everything else as-is). Two buttons:

- **Download recording** — runs the existing `downloadJson` flow, leaves a "Saved …" confirmation in its place.
- **Discard** — clears state without writing a file.

Closing the popup before clicking either keeps the recording in memory (popup state) until next interaction. The recorder itself is fully stopped at this point — the only thing alive is the popup's React state holding the candidate file.

## New

- `packages/chrome-extension/src/popup/summary.ts` — pure `summarizeRecording(recording)` and `formatDuration(ms)` helpers. Computes duration, event count, per-kind counts, URL trail (with `start | navigate | reload | history | hash` tags), and a `hasUserInput` flag for the warning copy.
- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` — the post-stop panel. Renders the stats, a collapsible URL trail with reason chips (color-coded for `reload` and `navigate`), the share warning, and the Download / Discard actions.
- New `RecorderStatus` variants in `App.tsx`: `'review'` (panel shown, decision pending), `'saved'` (after Download), `'discarded'` (after Discard).
- CSS for `.trace-panel` and its children in `packages/chrome-extension/src/popup/popup.css` — matches the existing dark/light `color-mix` palette and the report panel's typography conventions.

## Changed

- `packages/chrome-extension/src/popup/App.tsx` — `stopAndExportRecording` renamed to `stopAndReviewRecording`; it stops the recorder and moves to the `'review'` state without downloading. New `handleDownloadRecording` and `handleDiscardRecording` handlers drive the panel's buttons. Render block now picks between `RecordingSummaryPanel`, the success line, and the "Recording discarded" notice.
- Footer label bumped to `v0.5.4 — trace preview + share warning`.

## Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/summary.ts` | New — recording-summary helpers (pure, popup-local). |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | New — review panel component with Download / Discard. |
| `packages/chrome-extension/src/popup/App.tsx` | Replace auto-download flow with review-then-download. New `'review' / 'saved' / 'discarded'` states. |
| `packages/chrome-extension/src/popup/popup.css` | Add `.trace-panel` styles (header, stats grid, URL trail, warning callout, action row). |
| `Versions/v0/v0.5.4/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: 147/147 tests still pass (no behavioral changes outside the popup). Type-check clean. Vite bundle clean.

### Live smoke

1. `pnpm build` in `packages/chrome-extension`.
2. Reload the webspec card at `chrome://extensions/` (no manifest change this version — the refresh icon is enough).
3. Cmd+R the TodoMVC tab so the new content script loads.
4. **Record workflow** → type "buy milk" → Enter → click **Active** → click **Completed**.
5. Click **■ Stop recording**. The summary panel should appear with:
   - Duration (~5–10s)
   - Events: 5 total (1 input · 1 keydown · 2 click · 2 navigate, plus any `change` from toggles)
   - URL trail: start URL → `#/active (hash)` → `#/completed (hash)`
   - ⚠ warning callout
   - **[Download recording]** and **[Discard]** buttons.
6. Click **Download** → file lands; success message replaces the panel.
7. Repeat steps 4–5, then click **Discard** → no file written; "Recording discarded — nothing saved." appears in place of the panel.

### What's still open in M5 (in order)

- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.
- Deferred (re-evaluated for M6-enables, not blocking M5): network capture via `chrome.webRequest`.
