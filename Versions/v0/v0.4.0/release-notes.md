# v0.4.0 — M5 Audit Report Tab (2026-05-11)

## On the minor bump

This is a minor version (`v0.3.9 → v0.4.0`) rather than a patch. Strictly, the project's convention says minor = milestone completion, and M5 isn't complete yet — recorder mode is still ahead. Bumping anyway is a deliberate stretch: this PR caps **audit mode polish** as a coherent phase. After v0.4.0, audit mode produces a real, shareable, downloadable artifact, and we shift gears to building the recorder. That phase boundary is real enough to mark with a minor.

Documenting the framing here so a future reader sees we knew what we were doing — not an accidental version bump.

## Problem

The popup view of an audit, even with the rules-checked split landed in v0.3.9, is the wrong artifact shape:

- **Cramped.** Capped at ~480px wide. Long failure summaries wrap badly; the rules-tested table compresses awkwardly.
- **Ephemeral.** The popup closes when the user clicks elsewhere. Nothing to share, save, or attach to a ticket.
- **Not screen-reader-friendly.** Popups are awkward for screen-readers to navigate. The dev-tool itself shouldn't be the a11y bottleneck.
- **No download path.** Users had to copy-paste Markdown into a file by hand.

An audit is a reference document. It deserves a full tab.

## Solution

Add a real report page that opens in its own tab when the audit completes.

- **New extension page** (`src/report/index.html`) declared in `manifest.config.ts` under `web_accessible_resources`. The CRX plugin auto-picks it up as a Vite entry; it bundles alongside the popup with the same chunk graph.
- **Storage handoff.** When the audit completes, the popup writes the `A11yReport` to `chrome.storage.local` under a session-unique key (`report:<timestamp>:<random>`), then opens `chrome.runtime.getURL('src/report/index.html?id=<key>')` in a new tab. The report page reads the key from the URL on mount and renders.
- **Popup keeps its inline view** as a quick-glance summary, but gains a primary **"Open full report ↗"** button alongside the existing **Copy as Markdown**. Both flows still work.
- **Three downloads** at the top of the report page: **Markdown** (uses the existing `renderA11yReportMarkdown`), **JSON** (uses `renderA11yReportJson`), **Print / Save as PDF** (browser-native `window.print()` with a print stylesheet). All three produce the same data — popup and CLI also produce byte-identical output.
- **Storage permission** added to the manifest (no other new permissions; `<all_urls>` for `web_accessible_resources` is required by Chrome to allow opening the page from any tab context).
- **Error surface.** Missing or stale storage key (URL shared, storage cleared) → the page renders an honest error pointing back at the popup. No silent failures.

The current visual layout is a **placeholder pending a real design pass** — wired data, working downloads, accessible HTML, minimal styling. Class names + DOM structure are the contract; swap visuals freely without changing data plumbing.

## New

- `packages/chrome-extension/src/report/{index.html, main.tsx, ReportPage.tsx, report.css}` — full-page report tab.
- `web_accessible_resources` entry in `manifest.config.ts`.
- `storage` permission in the manifest.
- `stashReport` helper in the popup (writes to `chrome.storage.local`).
- `loadReportFromStorage` helper in the report page (reads + validates).
- Print stylesheet — Cmd+P/Ctrl+P from the report tab produces a clean PDF.

## Changed

- `packages/chrome-extension/src/popup/App.tsx` — status machine carries `storageKey`; new `handleOpenReportClick` opens the report tab.
- `packages/chrome-extension/src/popup/ReportView.tsx` — `ReportViewProps` gains `onOpenFullReport`; popup header renders the new "Open full report ↗" button + the existing Copy button side-by-side.
- `packages/chrome-extension/src/popup/popup.css` — `.report-actions` flex row + `.open-report-btn` styles.
- `packages/chrome-extension/manifest.config.ts` — add `storage` permission + `web_accessible_resources`.

## Removed

- N/A.

## Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/report/index.html` | New — report-page HTML entry. |
| `packages/chrome-extension/src/report/main.tsx` | New — React root. |
| `packages/chrome-extension/src/report/ReportPage.tsx` | New — full-page component + downloads + storage handoff. |
| `packages/chrome-extension/src/report/report.css` | New — placeholder styling + print stylesheet. |
| `packages/chrome-extension/manifest.config.ts` | Add `storage` permission, `web_accessible_resources`. |
| `packages/chrome-extension/src/popup/App.tsx` | Stash report to storage; open report tab. |
| `packages/chrome-extension/src/popup/ReportView.tsx` | New "Open full report ↗" button. |
| `packages/chrome-extension/src/popup/popup.css` | Style the new action row. |
| `Versions/v0/v0.4.0/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean (now includes `src/report/index.html` as a second HTML entry).

### Live smoke

1. `make build && make ext-build` (or `make ci`).
2. `chrome://extensions` → reload the webspec card.
3. Open `https://example.com` → click webspec → **Audit this tab**.
4. Popup shows the inline summary + a new **Open full report ↗** button. Click it.
   - **Expected:** a new tab opens at `chrome-extension://<id>/src/report/index.html?id=report:<...>` rendering the same data the popup shows, but with room to breathe.
5. From the report tab:
   - **Download Markdown** → saves `a11y-report.md`. Open it — content matches `webspec audit https://example.com` from the CLI.
   - **Download JSON** → saves `a11y-report.json`. Round-trips through `A11yReportSchema`.
   - **Print / Save as PDF** → opens the browser print dialog; the print stylesheet hides the download buttons and produces a clean PDF.
6. Sanity-check the error path: copy the report tab's URL, close the tab, open a new tab, paste — should show "Report data not found" (storage was scoped to the original session).

### Design status

The current report tab styling is a working placeholder. A design pass (Claude design / Artifacts) will polish typography, spacing, color hierarchy, and overall product feel — swapping markup in `ReportPage.tsx` and styles in `report.css` without changing the data plumbing.
