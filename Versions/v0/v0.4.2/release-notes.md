# v0.4.2 — M5 Report Tab Design Polish (2026-05-11)

## Problem

v0.4.0 shipped the report tab with intentionally placeholder styling: working data plumbing, working downloads, basic typography. The "real design" was deferred to a dedicated pass so visual iteration didn't get tangled with build-pipeline plumbing. That dedicated pass is this PR.

## Solution

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

## New

- `interface StashedReport { scannedAt: string; report: A11yReport }` (declared in the popup) for the storage handoff.
- `formatScannedAt`, `labelForTargetKind`, `countFailingRules`, `countTestedStatuses` helpers in `ReportPage.tsx` for the new layout.
- `_tmp/` entry in `.gitignore` so design mockups + smoke fixtures stay local.

## Changed

- `packages/chrome-extension/src/report/ReportPage.tsx` — rewritten against the design's structure (cover / summary / violations / rules tested / not applicable / footer). All data interpolated from `A11yReport` + `scannedAt`. Edge cases preserved: missing `helpUrl` (plain text rule name), empty `ruleSets` ("Best practice" italic tag), empty severity buckets (skipped), tested-only / inapplicable-only (sections omit cleanly).
- `packages/chrome-extension/src/report/report.css` — replaced with the design's full stylesheet. Light/dark tokens, severity colors, stats grid, finding cards, table, print rules. Added loading + error state styles (the design didn't cover those; same token palette).
- `packages/chrome-extension/src/popup/App.tsx` — `stashReport` wraps in `StashedReport` shape.

## Fixed

- `report.css` previously rendered each finding selector as inline code with constrained width; long CSS selectors wrapped awkwardly. New `code.selector` block displays the selector in its own bordered box with horizontal scroll for overflow — much more readable for real-world selectors.

## Files Changed

| File | Change |
|------|--------|
| `.gitignore` | Ignore `_tmp/` for local design mockups + smoke fixtures. |
| `packages/chrome-extension/src/popup/App.tsx` | Wrap stashed report with `scannedAt` timestamp. |
| `packages/chrome-extension/src/report/ReportPage.tsx` | Rewrite against the new design structure; same data model. |
| `packages/chrome-extension/src/report/report.css` | Drop-in replacement with the design system (tokens, dark mode, print, severity, components). |
| `Versions/v0/v0.4.2/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean (~4.85 KB CSS gzipped to 1.29 KB — the new design weighs about 2.7 KB more gzipped than the placeholder).

### Live smoke

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
