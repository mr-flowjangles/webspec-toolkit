# v0.5.2 — Session State Persistence (2026-05-11)

## Problem

The recorder lived entirely in the content script's module-scope variables and `performance.now()`-relative timestamps. The moment the page reloaded — or the user clicked any link that triggered a fresh document — the content script was torn down and rebuilt, taking the recording with it. The popup's React state already handled its own transience via `hydrateRecorderStatus`, but it asked the content script for ground truth, and the content script had no truth left to give. v0.5.1 surfaced this loudly: every test of "what if I refresh the page mid-recording?" lost everything.

## Solution

Mirror the recording snapshot into `chrome.storage.session` on every event so it survives any content-script restart. The service worker brokers reads and writes because content scripts can't see their own `tab.id` — `sender.tab.id` is available only to the service worker, which uses it to key storage per tab. On (re)load, the content script asks the service worker for its tab's snapshot; if one exists, it restores in-memory state, rebinds event listeners, and resumes capturing.

Event timestamps switch from `performance.now()`-relative (resets to 0 on each new document) to wall-clock-relative (`Date.now() - recorderStartMs`) so the recording timeline stays coherent across reloads.

A subtle wrinkle showed up during the smoke: Manifest V3 service workers idle-terminate after ~30 seconds, and Chrome occasionally drops the first message that lands during a cold start. `bootstrapRecorder` retries up to three times with backoff so a reload after a long pause still restores. Without retries, the smoke would reproduce "Stop button is gone" on the second reload of a quiet recording — exactly the symptom we set out to fix.

## New

- `RecorderSessionState`, `RecorderSessionGet/Put/ClearRequest`, and matching response types in `packages/chrome-extension/src/shared/messages.ts` — typed protocol between the content script and the service worker.
- Service worker session broker in `packages/chrome-extension/src/service-worker/index.ts` — `getSession`, `putSession`, `clearSession` helpers backed by `chrome.storage.session`, keyed by `webspec:recorder:<tabId>`.
- `chrome.tabs.onRemoved` listener in the service worker — drops the snapshot when the tab closes, since `chrome.storage.session` doesn't garbage-collect on its own.
- `bootstrapRecorder()` in the content script — runs at module load, queries the service worker, restores state and rebinds listeners if a recording was in flight. Retries up to three times with backoff (50ms / 100ms / 150ms) to survive service-worker cold starts.
- `persistSession()` helper — fires after every event handler, pushing the latest snapshot to the service worker. Fire-and-forget: the next event re-persists, so a dropped write self-heals.
- `addRecorderListeners()` / `removeRecorderListeners()` helpers — extracted so bootstrap can rebind the same handler set the start path uses, with no chance of drift.

## Changed

- `packages/chrome-extension/src/content-script/index.ts` — replace `performance.now()`-relative timestamps with `Date.now() - recorderStartMs`. `startRecorder` now persists on start and `stopRecorder` clears the session. Every event handler calls `persistSession()` after pushing (or coalescing, in the input case). The message router awaits a module-level `bootstrapPromise` before answering recorder queries so a popup status query that arrives during the async restore still sees the resumed state.
- `packages/chrome-extension/src/service-worker/index.ts` — no longer a v0.3.7 scaffold; now hosts the session broker and the tab-removed cleanup listener.

## Fixed

- Recording state survives page reload. Cmd+R on the active tab during a recording no longer drops events or the Stop button; the popup correctly re-hydrates.
- Stop button reappears across multiple consecutive reloads. The retry-with-backoff in `bootstrapRecorder` covers the service-worker idle-termination case that v0.5.1's design didn't account for.
- Event timestamps are coherent across reloads — a recording spanning a reload now reports monotonically-increasing `t` values, not a reset to near-zero after the reload.

## Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/messages.ts` | Add `RecorderSessionState` + `recorder:session:get/put/clear` request/response types and guards. |
| `packages/chrome-extension/src/service-worker/index.ts` | Implement the session broker over `chrome.storage.session`. Clear per-tab state on `chrome.tabs.onRemoved`. |
| `packages/chrome-extension/src/content-script/index.ts` | Switch to wall-clock timestamps. Add `bootstrapRecorder` (with retry/backoff), `persistSession`, and the listener-add/remove helpers. Persist after every event. Await bootstrap in the message router. |
| `Versions/v0/v0.5.2/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: 147/147 tests still pass (no test changes in this version). Type-check clean (`tsc --noEmit`), extension Vite bundle clean.

### Live smoke

1. `pnpm build` in `packages/chrome-extension`.
2. Remove + reload the webspec card at `chrome://extensions/` (wakes the new service worker).
3. Open a fresh `https://demo.playwright.dev/todomvc/#/` tab.
4. Click **Record workflow** → type a todo → press Enter.
5. **Cmd+R** the TodoMVC page.
6. Reopen the popup. **Stop recording** should still be there.
7. **Wait ~30 seconds** so the service worker idle-terminates.
8. Cmd+R again, reopen popup. Stop should still be there (this exercises the cold-start retry path).
9. Type a second todo, press Enter, click **■ Stop recording**.
10. Open the recording. The second todo's `t` value should be larger than the first's — proving the timeline survived the reload.

If step 6 or 8 fails, open the page DevTools console. Look for `[webspec] content script loaded:` (every reload), `[webspec] recorder resumed: N events buffered` (bootstrap succeeded), or `[webspec] bootstrap attempt N rejected/returned error` (bootstrap fell back to retry).

### What's still open in M5 (in order)

- **v0.5.3** — Navigation event capture (`chrome.webNavigation.onCommitted`). Now that state survives reloads, recordings can span same-origin navigations cleanly; the next step is recording the navigation itself as a typed `RecordedEvent` so renderers can emit `page.waitForURL()` / verify navigation.
- **v0.5.4** — Trace summary preview in popup + "review before sharing" warning.
- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.
