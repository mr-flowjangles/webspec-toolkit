# v0.4

## v0.4.2 — M5 Report Tab Design Polish (2026-05-11)

### Problem

v0.4.0 shipped the report tab with intentionally placeholder styling: working data plumbing, working downloads, basic typography. The "real design" was deferred to a dedicated pass so visual iteration didn't get tangled with build-pipeline plumbing. That dedicated pass is this PR.

### Solution

Drop in the design produced by Claude design / Artifacts. **Pure cosmetic swap** — no contract changes, no new permissions, no new dependencies, no new data plumbing beyond a one-line wrapper for the scan timestamp.

What landed visually:

- **Bellese Prussian Blue (#002D72)** as the accent color. Used for links, the cover eyebrow accent dot, focus rings, and print accents.
- **Token-based design system** in CSS custom properties (surfaces / text / accent / severity / status / type / layout). Easy to retune without touching components.
- **Full dark mode** via `prefers-color-scheme: dark` — tokens shift, components inherit. No JS toggle.
- **Severity palette**: critical=red (`#c81e1e`), serious=orange (`#c2410c`), moderate=amber (`#a16207`), minor=grey (`#52525b`). Severity gets a colored bar in the group head and a colored pill on each finding card.
- **Cover header** with an "ACCESSIBILITY AUDIT" eyebrow, large title, target URL in monospace with a trailing arrow, then a `<dl>` grid of Target / Engine / Rule set / Scanned. Download buttons (Markdown / JSON / Print) with inline SVG icons.
- **Summary** as a 5-column stat grid: Total + four severity counts. The Total card has the sub-line "N rules failing"; zero-count severity stats render dimmed.
- **Finding cards** with rule name (link-styled to helpUrl when present), tag pills for the rule sets, severity pill on the right, monospace selector block, then the failure summary as flowing prose.
- **Rules-tested table** with right colored status pips (pass green / fail red / incomplete amber).
- **Not-applicable section** styled as a single compact card with a rounded count chip + comma-separated rule IDs.
- **Skip link**, proper `:focus-visible` outlines, semantic HTML (`<header>`, `<main>`, `<section aria-labelledby>`, `<dl>`, `<article>`, scoped `<th>`). The audit tool's own UI is a11y-exemplary, per the design brief.
- **Print stylesheet** drops the download buttons, lightens borders, paginates findings without splitting cards mid-page.
- **Responsive** breakpoints at 760px (summary collapses to 2-up) and 640px (cover meta to 2-up, cover h1 shrinks).

One supporting plumbing change: the popup now stashes `{ scannedAt, report }` instead of bare `A11yReport` so the design can render a real scan timestamp (the `A11yReport` contract doesn't carry one; that lives on `Analysis.meta.createdAt`, but the popup skips the Analysis envelope). The new shape is internal to popup ↔ report-tab handoff — no contract change.

### New

- `interface StashedReport { scannedAt: string; report: A11yReport }` (declared in the popup) for the storage handoff.
- `formatScannedAt`, `labelForTargetKind`, `countFailingRules`, `countTestedStatuses` helpers in `ReportPage.tsx` for the new layout.
- `_tmp/` entry in `.gitignore` so design mockups + smoke fixtures stay local.

### Changed

- `packages/chrome-extension/src/report/ReportPage.tsx` — rewritten against the design's structure (cover / summary / violations / rules tested / not applicable / footer). All data interpolated from `A11yReport` + `scannedAt`. Edge cases preserved: missing `helpUrl` (plain text rule name), empty `ruleSets` ("Best practice" italic tag), empty severity buckets (skipped), tested-only / inapplicable-only (sections omit cleanly).
- `packages/chrome-extension/src/report/report.css` — replaced with the design's full stylesheet. Light/dark tokens, severity colors, stats grid, finding cards, table, print rules. Added loading + error state styles (the design didn't cover those; same token palette).
- `packages/chrome-extension/src/popup/App.tsx` — `stashReport` wraps in `StashedReport` shape.

### Fixed

- `report.css` previously rendered each finding selector as inline code with constrained width; long CSS selectors wrapped awkwardly. New `code.selector` block displays the selector in its own bordered box with horizontal scroll for overflow — much more readable for real-world selectors.
- **Report tab was blank in v0.4.0 and v0.4.1.** The HTML in `web_accessible_resources` was copied through but its `<script src="./main.tsx">` referenced the source TSX, not a build output — Vite never treated the report HTML as an entry, so its TSX was never bundled. `vite.config.ts` now adds `src/report/index.html` to `rollupOptions.input` so the report bundle (`report-*.js` + `report-*.css`) is emitted and the built HTML references them correctly. Caught while smoke-testing the new design; the previous "placeholder report" never actually rendered live.
- Popup footer label was stale (`v0.4.1 — recorder skeleton (clicks only)`); bumped to `v0.4.2 — report tab design polish`.

### Files Changed

| File | Change |
|------|--------|
| `.gitignore` | Ignore `_tmp/` for local design mockups + smoke fixtures. |
| `packages/chrome-extension/src/popup/App.tsx` | Wrap stashed report with `scannedAt` timestamp; refresh footer label. |
| `packages/chrome-extension/vite.config.ts` | Add `src/report/index.html` to `rollupOptions.input` so the report bundle is emitted (fixes blank report tab shipped in v0.4.0/v0.4.1). |
| `packages/chrome-extension/src/report/ReportPage.tsx` | Rewrite against the new design structure; same data model. |
| `packages/chrome-extension/src/report/report.css` | Drop-in replacement with the design system (tokens, dark mode, print, severity, components). |
| `Versions/v0/v0.4.2/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean (~4.85 KB CSS gzipped to 1.29 KB — the new design weighs about 2.7 KB more gzipped than the placeholder).

#### Live smoke

1. `make build && make ext-build` (or `make ci`).
2. Reload the webspec card in `chrome://extensions`.
3. Audit `https://example.com` → click **Open full report ↗** in the popup.
4. Expect the new design:
   - Prussian Blue accent on links + eyebrow dot.
   - Cover with "ACCESSIBILITY AUDIT" eyebrow, "A11y Report" h1, target URL with trailing arrow, 4-column meta grid.
   - Download buttons with icons.
   - Summary stats grid — 5 cards (Total + 4 severities). On example.com (clean), every severity stat reads "0" and renders dimmed.
   - Rules tested table with green Pass pips. Not applicable section with comma-separated rule IDs.
5. Audit a deliberately-broken page (the `/tmp/webspec-broken.html` fixture from earlier sessions, or any real-world site with violations) to see severity colors light up — red Critical pills, orange Serious, amber Moderate.
6. Try light + dark — toggle your OS appearance setting. The report should track without reloading.
7. **Print preview:** Cmd+P from the report tab. Download buttons should be hidden, background white, links rendered, findings should not split mid-card.

Design source preserved at `_tmp/A11y Report.html` (gitignored) in case anyone wants to compare against the original mockup.

## v0.4.1 — M5 Recorder Skeleton (2026-05-11)

### Problem

v0.4.0 closed the audit-mode polish arc. The other half of M5 — the **workflow recorder** — is the longest pole between us and the v1 mission ("generate Playwright tests from a real user workflow"). The recorder is multiple PRs of work; v0.4.1 stands up the *skeleton* so subsequent PRs (event types, hardened selectors, network capture, persistence) can layer on a validated architecture.

Without this PR, the **Record workflow** button in the popup is still a disabled placeholder.

### Solution

Click-only end-to-end recorder. The architecture proves out; selector quality and event coverage are deliberately minimal so the *plumbing* is the focus.

- **Message protocol** (`src/shared/messages.ts`). Two new request types: `recorder:start` and `recorder:stop`. Start returns `{ ok, startedAt, startUrl }`; Stop returns `{ ok, endedAt, events }`. Type guards mirror the audit-mode pattern.
- **Content script** keeps the audit-mode listener and adds two more. On `recorder:start`, it initializes a module-scope buffer + a `performance.now()` baseline and attaches a capture-phase `click` listener. On every click, it pushes a typed `RecordedEvent` with a basic CSS selector. On `recorder:stop`, it detaches the listener and returns the buffer.
- **Basic selector synthesis** (`src/content-script/selectors.ts`). `tag#id.class1.class2` style — filters generated-looking class names (`css-x1y2z3`, `_abc123`, `jsx-1234567`, trailing build hashes) so the resulting selector survives a single page load. **Not hardened** — that's v0.4.3.
- **Popup state machine.** Two independent flows (audit + recorder), each with their own status type. Audit unchanged. Recorder: `idle → starting → recording → stopping → recorded | error`. The Record button toggles between *Record workflow* and *■ Stop recording*; in-flight states show *Starting…* / *Saving…*. A persistent red banner says "Recording on this tab" while active, and a green success line confirms the saved filename + event count.
- **Export.** Stop → wrap captured events into a `WorkflowRecording` contract artifact (already locked in M1) with `network: []` (v0.4.4) and `framework: 'playwright'`. Serialize to JSON, download via `chrome.downloads.download({ url: blob, filename })`. Filename pattern: `recording-2026-05-11_10-30-45.json`.
- **Manifest:** adds the `downloads` permission. `activeTab` covers messaging into the active tab; `storage` covers the report artifact handoff from v0.4.0.

The audit and recorder flows are mutually exclusive in the popup (each disables the other's button while busy) — keeps the failure modes simple. Concurrent record-while-audit is conceivable but not useful in v1.

### What this PR does NOT do (and what brings each in)

- **Other event types** (`input`, `change`, `submit`, `keydown`, `navigate`) → v0.4.2.
- **Hardened selectors** (`data-testid > role+name > text > css`) → v0.4.3.
- **Network capture** (URL + method via `chrome.webRequest` from the service worker) → v0.4.4.
- **State persistence** (recording survives popup close / page navigation via `chrome.storage.session`) → v0.4.5.
- **Sensitive-input masking** (`<input type="password">` value replaced with marker) — moot at v0.4.1 since we only capture clicks; lands with v0.4.2's input/change handling.

### New

- `packages/chrome-extension/src/content-script/selectors.ts` — `buildBasicSelector(el)` returning a CSS selector string. Filters generated class names. Has a `CSS.escape` fallback.
- Five new types in `src/shared/messages.ts`: `RecorderStartRequest`, `RecorderStartResponse`, `RecorderStopRequest`, `RecorderStopResponse`, plus type guards.

### Changed

- `packages/chrome-extension/manifest.config.ts` — adds `downloads` to `permissions`.
- `packages/chrome-extension/src/content-script/index.ts` — adds recorder state + start/stop handlers + click capture; single message router dispatches all three message types (audit + recorder start + recorder stop).
- `packages/chrome-extension/src/popup/App.tsx` — adds `RecorderStatus` state machine, recorder button + banner + success line, `chrome.downloads.download` integration, helpers for active-tab discovery shared with the audit flow.
- `packages/chrome-extension/src/popup/popup.css` — `.recording-btn`, `.recorder-banner`, `.recorder-success` styles.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/messages.ts` | Add recorder message types + guards. |
| `packages/chrome-extension/src/content-script/index.ts` | Add recorder state + handlers; dispatch in single listener. |
| `packages/chrome-extension/src/content-script/selectors.ts` | New — basic CSS selector synthesis. |
| `packages/chrome-extension/src/popup/App.tsx` | Recorder state machine + UI + download. |
| `packages/chrome-extension/src/popup/popup.css` | Recorder button + banner + success styles. |
| `packages/chrome-extension/manifest.config.ts` | Add `downloads` permission. |
| `Versions/v0/v0.4.1/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean.

**No unit tests for the recorder in this PR.** The pure-logic surface is small (selector generation) and exercising it usefully requires a DOM. Adding `jsdom` or `happy-dom` as a dev dep for ~5 selector tests isn't worth it at v0.4.1. When hardened selectors land in v0.4.3 (real priority logic worth pinning), we add the testing harness then. v0.4.1 correctness is validated by the live smoke below.

#### Live smoke

1. `make build && make ext-build` (or `make ci`).
2. Reload the webspec extension in `chrome://extensions`.
3. Open any http(s) page with clickable elements — say `https://example.com`.
4. Click webspec → click **Record workflow**.
   - Button becomes red **■ Stop recording**.
   - A red banner says "Recording on this tab — click anywhere in the page to capture events."
   - The Audit button disables while recording.
5. Close the popup (it can close, the recorder runs in the content script).
6. Click around on the page — links, the body, anywhere with elements. Each click is being captured in the content script.
7. Reopen the popup. Click **■ Stop recording**.
   - Brief "Saving…" state → green success line: `Saved recording-<timestamp>.json (N events).`
   - Browser's download bar shows the JSON file.
8. Open the JSON. Should look like:
   ```json
   {
     "startedAt": "2026-05-11T...",
     "endedAt": "2026-05-11T...",
     "startUrl": "https://example.com/",
     "events": [
       {
         "t": 1234.56,
         "kind": "click",
         "selector": { "preferred": "a", "strategy": "css", "fallbacks": [] },
         "targetText": "More information..."
       }
     ],
     "network": [],
     "framework": "playwright"
   }
   ```
9. Edge case: click **Record workflow** on a `chrome://` tab → expect the "http(s) only" error.
10. Edge case: click **Record workflow**, then close the tab without stopping → no data loss in the popup (recorder state is in the content script and dies with the tab; popup shows nothing to recover — that's fine for v0.4.1).

## v0.4.0 — M5 Audit Report Tab (2026-05-11)

### On the minor bump

This is a minor version (`v0.3.9 → v0.4.0`) rather than a patch. Strictly, the project's convention says minor = milestone completion, and M5 isn't complete yet — recorder mode is still ahead. Bumping anyway is a deliberate stretch: this PR caps **audit mode polish** as a coherent phase. After v0.4.0, audit mode produces a real, shareable, downloadable artifact, and we shift gears to building the recorder. That phase boundary is real enough to mark with a minor.

Documenting the framing here so a future reader sees we knew what we were doing — not an accidental version bump.

### Problem

The popup view of an audit, even with the rules-checked split landed in v0.3.9, is the wrong artifact shape:

- **Cramped.** Capped at ~480px wide. Long failure summaries wrap badly; the rules-tested table compresses awkwardly.
- **Ephemeral.** The popup closes when the user clicks elsewhere. Nothing to share, save, or attach to a ticket.
- **Not screen-reader-friendly.** Popups are awkward for screen-readers to navigate. The dev-tool itself shouldn't be the a11y bottleneck.
- **No download path.** Users had to copy-paste Markdown into a file by hand.

An audit is a reference document. It deserves a full tab.

### Solution

Add a real report page that opens in its own tab when the audit completes.

- **New extension page** (`src/report/index.html`) declared in `manifest.config.ts` under `web_accessible_resources`. The CRX plugin auto-picks it up as a Vite entry; it bundles alongside the popup with the same chunk graph.
- **Storage handoff.** When the audit completes, the popup writes the `A11yReport` to `chrome.storage.local` under a session-unique key (`report:<timestamp>:<random>`), then opens `chrome.runtime.getURL('src/report/index.html?id=<key>')` in a new tab. The report page reads the key from the URL on mount and renders.
- **Popup keeps its inline view** as a quick-glance summary, but gains a primary **"Open full report ↗"** button alongside the existing **Copy as Markdown**. Both flows still work.
- **Three downloads** at the top of the report page: **Markdown** (uses the existing `renderA11yReportMarkdown`), **JSON** (uses `renderA11yReportJson`), **Print / Save as PDF** (browser-native `window.print()` with a print stylesheet). All three produce the same data — popup and CLI also produce byte-identical output.
- **Storage permission** added to the manifest (no other new permissions; `<all_urls>` for `web_accessible_resources` is required by Chrome to allow opening the page from any tab context).
- **Error surface.** Missing or stale storage key (URL shared, storage cleared) → the page renders an honest error pointing back at the popup. No silent failures.

The current visual layout is a **placeholder pending a real design pass** — wired data, working downloads, accessible HTML, minimal styling. Class names + DOM structure are the contract; swap visuals freely without changing data plumbing.

### New

- `packages/chrome-extension/src/report/{index.html, main.tsx, ReportPage.tsx, report.css}` — full-page report tab.
- `web_accessible_resources` entry in `manifest.config.ts`.
- `storage` permission in the manifest.
- `stashReport` helper in the popup (writes to `chrome.storage.local`).
- `loadReportFromStorage` helper in the report page (reads + validates).
- Print stylesheet — Cmd+P/Ctrl+P from the report tab produces a clean PDF.

### Changed

- `packages/chrome-extension/src/popup/App.tsx` — status machine carries `storageKey`; new `handleOpenReportClick` opens the report tab.
- `packages/chrome-extension/src/popup/ReportView.tsx` — `ReportViewProps` gains `onOpenFullReport`; popup header renders the new "Open full report ↗" button + the existing Copy button side-by-side.
- `packages/chrome-extension/src/popup/popup.css` — `.report-actions` flex row + `.open-report-btn` styles.
- `packages/chrome-extension/manifest.config.ts` — add `storage` permission + `web_accessible_resources`.

### Removed

- N/A.

### Files Changed

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

### Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean (now includes `src/report/index.html` as a second HTML entry).

#### Live smoke

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

#### Design status

The current report tab styling is a working placeholder. A design pass (Claude design / Artifacts) will polish typography, spacing, color hierarchy, and overall product feel — swapping markup in `ReportPage.tsx` and styles in `report.css` without changing the data plumbing.

