# v0.3.8 — M5 Extension Audit Mode (2026-05-11)

## Problem

v0.3.7 stood up the extension scaffold (manifest, build pipeline, popup stub, content-script stub, service-worker stub) but the popup buttons were inert. The v1 mission needs the extension's **audit mode** working before it can claim to be a "shift-left companion" — a dev should be able to click the toolbar icon on their app, hit a button, and see WCAG/508 findings in the popup.

## Solution

End-to-end audit flow inside the extension. Popup ↔ content script messaging, axe-core injection, typed `A11yReport` rendered as React in the popup. Same `normalizeAxeResults` and same rule-set behavior as the CLI — Node and browser modes produce identical reports from identical pages.

- **Typed message protocol** (`src/shared/messages.ts`). Shared between popup and content script; both ends import the same types so the wire format can't drift. Request: `{ type: 'audit:request' }`. Response: `{ ok: true, results: AxeResults } | { ok: false, error: string }`.
- **Content script** (`src/content-script/index.ts`). Listens on `chrome.runtime.onMessage`. On audit request, runs `axe.run(document, { runOnly: { type: 'tag', values: [...] } })` against the page with the same five tags the Node mode uses. Returns raw `AxeResults`; normalization happens in the popup.
- **Popup** (`src/popup/App.tsx`). Status machine: `idle → running → (report | error)`. Audit handler queries active tab via `chrome.tabs.query`, sends the audit request, normalizes the response via `@webspec/core/browser`, renders. Surface-level error messages cover the cases the user can actually act on (non-http(s) tab, content script not loaded — telling them to reload the page).
- **`ReportView` component** (`src/popup/ReportView.tsx`). Severity-grouped findings as a React render driven by the typed `A11yReport`, not via the markdown renderer. Each finding shows: rule ID (linked to `helpUrl` when present), rolled-up rule sets ("WCAG 2.1 AA, Section 508"), selector in code, collapsed `failureSummary`. Severity headings use color cues (red/orange/amber/grey).
- **"Copy as Markdown" button.** Calls `renderA11yReportMarkdown` from core's browser entry — the popup and CLI emit byte-identical reports for the same findings. Brief "Copied!" / "Copy failed" state via `setTimeout`.
- **Popup width** grew from `min-width: 280px` to `min-width: 360px; max-width: 480px` so the report renders comfortably.

The `humanizeRuleSets` rollup is currently duplicated between core's markdown renderer and `ReportView`. Three-line function; inline comment notes the duplication. If a third consumer shows up (or a tag-set change reveals drift), extract to a shared helper.

## New

- `packages/chrome-extension/src/shared/messages.ts` — typed message protocol + `isAuditRequest` guard.
- `packages/chrome-extension/src/popup/ReportView.tsx` — React render for `A11yReport`.

## Changed

- `packages/chrome-extension/src/content-script/index.ts` — axe-core injection + `audit:request` listener. (Was: load marker only.)
- `packages/chrome-extension/src/popup/App.tsx` — full audit flow (status machine, active-tab messaging, error handling, copy-to-clipboard).
- `packages/chrome-extension/src/popup/popup.css` — popup sizing (360–480px), report layout (cards), severity-color headings, finding-item styles, error-message styling.

## Removed

- N/A.

## Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/messages.ts` | New — typed message protocol. |
| `packages/chrome-extension/src/content-script/index.ts` | Replace load-marker stub with axe injection + audit-request listener. |
| `packages/chrome-extension/src/popup/App.tsx` | Replace stub with status-machine audit flow. |
| `packages/chrome-extension/src/popup/ReportView.tsx` | New — typed React report render. |
| `packages/chrome-extension/src/popup/popup.css` | Resize popup; add report + severity + finding + error styles. |
| `Versions/v0/v0.3.8/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **110/110 tests pass**, library build clean, extension Vite bundle clean.

Build output: content-script bundle is ~584 KB minified / 161 KB gzipped — bigger than the v0.3.7 scaffold because axe-core itself is the bulk. Within acceptable bounds for a content script; if it ever becomes a real constraint (slow injection on huge pages), dynamic-import via `chrome.scripting.executeScript` is the obvious next step.

### Live smoke — exercise the audit flow

1. `make build && make ext-build` (or `make ci`).
2. Chrome → `chrome://extensions` → **Load unpacked** → `packages/chrome-extension/dist/`.
   - If the v0.3.7 extension is already installed, click the reload icon on the webspec card.
3. Navigate to `https://example.com` (a clean page).
4. Pin webspec → click the toolbar icon → click **Audit this tab**.
   - **Expected:** "Auditing…" briefly, then a "Clean — N passes · M incomplete." summary, no severity sections, a **Copy as Markdown** button.
5. Click **Copy as Markdown** → paste somewhere. Should match what `webspec audit https://example.com` outputs from the CLI.
6. Navigate to a deliberately-broken local page (use the same fixture from v0.3.5/v0.3.6 — `<img>` with no alt, `<input>` with no label, low-contrast button). Click **Audit this tab**.
   - **Expected:** 4 violations in Critical/Serious buckets, image-alt + label tagged "WCAG 2.1 AA, Section 508", color-contrast + html-has-lang tagged "WCAG 2.1 AA". Identical to the v0.3.6 CLI smoke output.
7. Try on a `chrome://settings` tab → click **Audit this tab**.
   - **Expected:** `"webspec only audits http(s) pages. Navigate to a regular web page and try again."` error.
8. Open a tab that existed *before* you reloaded the extension → click **Audit this tab** without reloading the tab.
   - **Expected:** `"Content script not loaded yet — reload the page and try again."` error.

If any step fails, that's a real bug — flag before the recorder PR goes on top.
