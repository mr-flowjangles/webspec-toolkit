# v0.4.1 — M5 Recorder Skeleton (2026-05-11)

## Problem

v0.4.0 closed the audit-mode polish arc. The other half of M5 — the **workflow recorder** — is the longest pole between us and the v1 mission ("generate Playwright tests from a real user workflow"). The recorder is multiple PRs of work; v0.4.1 stands up the *skeleton* so subsequent PRs (event types, hardened selectors, network capture, persistence) can layer on a validated architecture.

Without this PR, the **Record workflow** button in the popup is still a disabled placeholder.

## Solution

Click-only end-to-end recorder. The architecture proves out; selector quality and event coverage are deliberately minimal so the *plumbing* is the focus.

- **Message protocol** (`src/shared/messages.ts`). Two new request types: `recorder:start` and `recorder:stop`. Start returns `{ ok, startedAt, startUrl }`; Stop returns `{ ok, endedAt, events }`. Type guards mirror the audit-mode pattern.
- **Content script** keeps the audit-mode listener and adds two more. On `recorder:start`, it initializes a module-scope buffer + a `performance.now()` baseline and attaches a capture-phase `click` listener. On every click, it pushes a typed `RecordedEvent` with a basic CSS selector. On `recorder:stop`, it detaches the listener and returns the buffer.
- **Basic selector synthesis** (`src/content-script/selectors.ts`). `tag#id.class1.class2` style — filters generated-looking class names (`css-x1y2z3`, `_abc123`, `jsx-1234567`, trailing build hashes) so the resulting selector survives a single page load. **Not hardened** — that's v0.4.3.
- **Popup state machine.** Two independent flows (audit + recorder), each with their own status type. Audit unchanged. Recorder: `idle → starting → recording → stopping → recorded | error`. The Record button toggles between *Record workflow* and *■ Stop recording*; in-flight states show *Starting…* / *Saving…*. A persistent red banner says "Recording on this tab" while active, and a green success line confirms the saved filename + event count.
- **Export.** Stop → wrap captured events into a `WorkflowRecording` contract artifact (already locked in M1) with `network: []` (v0.4.4) and `framework: 'playwright'`. Serialize to JSON, download via `chrome.downloads.download({ url: blob, filename })`. Filename pattern: `recording-2026-05-11_10-30-45.json`.
- **Manifest:** adds the `downloads` permission. `activeTab` covers messaging into the active tab; `storage` covers the report artifact handoff from v0.4.0.

The audit and recorder flows are mutually exclusive in the popup (each disables the other's button while busy) — keeps the failure modes simple. Concurrent record-while-audit is conceivable but not useful in v1.

## What this PR does NOT do (and what brings each in)

- **Other event types** (`input`, `change`, `submit`, `keydown`, `navigate`) → v0.4.2.
- **Hardened selectors** (`data-testid > role+name > text > css`) → v0.4.3.
- **Network capture** (URL + method via `chrome.webRequest` from the service worker) → v0.4.4.
- **State persistence** (recording survives popup close / page navigation via `chrome.storage.session`) → v0.4.5.
- **Sensitive-input masking** (`<input type="password">` value replaced with marker) — moot at v0.4.1 since we only capture clicks; lands with v0.4.2's input/change handling.

## New

- `packages/chrome-extension/src/content-script/selectors.ts` — `buildBasicSelector(el)` returning a CSS selector string. Filters generated class names. Has a `CSS.escape` fallback.
- Five new types in `src/shared/messages.ts`: `RecorderStartRequest`, `RecorderStartResponse`, `RecorderStopRequest`, `RecorderStopResponse`, plus type guards.

## Changed

- `packages/chrome-extension/manifest.config.ts` — adds `downloads` to `permissions`.
- `packages/chrome-extension/src/content-script/index.ts` — adds recorder state + start/stop handlers + click capture; single message router dispatches all three message types (audit + recorder start + recorder stop).
- `packages/chrome-extension/src/popup/App.tsx` — adds `RecorderStatus` state machine, recorder button + banner + success line, `chrome.downloads.download` integration, helpers for active-tab discovery shared with the audit flow.
- `packages/chrome-extension/src/popup/popup.css` — `.recording-btn`, `.recorder-banner`, `.recorder-success` styles.

## Fixed

- N/A.

## Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/messages.ts` | Add recorder message types + guards. |
| `packages/chrome-extension/src/content-script/index.ts` | Add recorder state + handlers; dispatch in single listener. |
| `packages/chrome-extension/src/content-script/selectors.ts` | New — basic CSS selector synthesis. |
| `packages/chrome-extension/src/popup/App.tsx` | Recorder state machine + UI + download. |
| `packages/chrome-extension/src/popup/popup.css` | Recorder button + banner + success styles. |
| `packages/chrome-extension/manifest.config.ts` | Add `downloads` permission. |
| `Versions/v0/v0.4.1/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean.

**No unit tests for the recorder in this PR.** The pure-logic surface is small (selector generation) and exercising it usefully requires a DOM. Adding `jsdom` or `happy-dom` as a dev dep for ~5 selector tests isn't worth it at v0.4.1. When hardened selectors land in v0.4.3 (real priority logic worth pinning), we add the testing harness then. v0.4.1 correctness is validated by the live smoke below.

### Live smoke

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
