# v0.5.3 — Navigation Event Capture (2026-05-11)

## Problem

The recorder captured DOM events but said nothing about URL changes. A workflow that clicked a link, navigated to another page, and continued from there showed up as two unrelated sequences of clicks — no record of the navigation between them. v0.5.2 made state survive reloads, but the recording still had a silent gap where the navigation happened: no event marker, no indication that the URL changed, no signal a renderer could use to emit `page.waitForURL()` or `page.reload()`. The `RecordedEvent` schema already had a `kind: 'navigate'` shape from M1, but nothing was producing them.

## Solution

Wire `chrome.webNavigation` to the recorder. Three listeners in the service worker cover the four navigation kinds:

- `onCommitted` — cross-document loads (link clicks, form submits) and reloads.
- `onHistoryStateUpdated` — `pushState` / `replaceState` (SPA routing).
- `onReferenceFragmentUpdated` — fragment-only changes (hash routing).

Each fired event is checked against the session-state map (v0.5.2's broker). If the tab has an active recording, a `navigate` event is added with a `reason` field — `'navigate'`, `'reload'`, `'history'`, or `'hash'` — so a renderer at M6 can emit the right Playwright call (`waitForURL`, `reload`, or an assertion after an SPA route change).

**Two writers, no race.** Same-document navigations send a `recorder:append-event` message to the still-alive content script, which appends to its in-memory buffer and persists. Cross-document navigations happen at the moment the content script is being torn down — the service worker writes the event directly to storage instead, and the new content script's bootstrap on the new document picks it up. Each case has exactly one writer.

Distinguishing reload from cross-document load uses `details.transitionType === 'reload'` from `onCommitted`. The renderer treats them differently — reload → `page.reload()`, navigate → `page.goto(url)` or assertion after a click.

## New

- `reason` field on the `navigate` event in `packages/core/src/types/analysis.ts` — `z.enum(['navigate', 'reload', 'history', 'hash'])`. Required, not optional. Renderers will pattern-match on this to decide which Playwright primitive to emit.
- `RecorderAppendEventRequest` / `RecorderAppendEventResponse` message types in `packages/chrome-extension/src/shared/messages.ts` — service worker → content script push for same-document navigations. The response carries an `absorbed` flag so the SW knows whether to fall back to a direct storage write.
- `handleNavigation` in `packages/chrome-extension/src/service-worker/index.ts` — single entry point used by all three webNavigation listeners, branching on same- vs. cross-document and routing the event accordingly.
- `chrome.webNavigation.onCommitted` / `onHistoryStateUpdated` / `onReferenceFragmentUpdated` listeners in the service worker.
- `recorder:append-event` handler in the content script's message router — appends to the live buffer when a recording is in flight; reports `absorbed: false` when idle so the SW can fall back.

## Changed

- `packages/chrome-extension/manifest.config.ts` — add `webNavigation` permission. Users see the permission prompt on first reload of the unpacked extension.
- `packages/chrome-extension/src/service-worker/index.ts` — module docstring rolled forward to v0.5.3 scope; webNavigation handlers landed alongside the v0.5.2 session broker.
- `packages/chrome-extension/src/content-script/index.ts` — imports + message router extended; no changes to event-handler logic or session persistence.
- `packages/chrome-extension/src/shared/messages.ts` — scope comment rolled forward to mention the SW→CS push.

## Fixed

- Navigation between events is no longer invisible. A workflow that clicks a link and continues on the destination page now has a `navigate` event in the recording, with the destination URL and a `reason` tagging which Chrome navigation kind it was.
- Reloads during recording show up as their own typed events (`reason: 'reload'`), not silent gaps. Renderers can emit `page.reload()` faithfully.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add `reason` enum to the `navigate` event schema. |
| `packages/chrome-extension/manifest.config.ts` | Add `webNavigation` permission. |
| `packages/chrome-extension/src/shared/messages.ts` | Add `recorder:append-event` request/response types + guard. |
| `packages/chrome-extension/src/service-worker/index.ts` | Implement `handleNavigation`; wire three webNavigation listeners. |
| `packages/chrome-extension/src/content-script/index.ts` | Handle `recorder:append-event` in the message router. |
| `Versions/v0/v0.5.3/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: 147/147 tests still pass. Type-check clean (`tsc --noEmit` in core and chrome-extension). Vite bundle clean.

### Live smoke

1. `pnpm build` in `packages/chrome-extension`.
2. **Remove + Load unpacked** the webspec card at `chrome://extensions/` (manifest changed — Chrome shows a `webNavigation` permission prompt; accept it).
3. Open `https://demo.playwright.dev/todomvc/#/` in a fresh tab.
4. Click **Record workflow** → type a todo → press Enter.
5. Click **Active** filter link at the bottom → expect `navigate` event with `reason: 'hash'`.
6. **Cmd+R** the page → expect `navigate` event with `reason: 'reload'`.
7. Click **"real TodoMVC app."** link (or any external link in the banner) → expect `navigate` event with `reason: 'navigate'` and URL pointing to the new origin.
8. Click **■ Stop recording**.
9. Open the downloaded JSON. The event timeline should be monotonic across all reloads and contain at least three of the four `reason` types. (`'history'` doesn't appear on TodoMVC because it uses hash routing, not the History API — to exercise it, record on a History-API SPA like a React Router demo.)

Sample (from the v0.5.3 smoke) — TodoMVC walkthrough with two reloads and a cross-document jump:

```json
{ "kind": "navigate", "reason": "hash",     "t": 12258, "url": ".../todomvc/#/active" }
{ "kind": "navigate", "reason": "reload",   "t": 23583, "url": ".../todomvc/#/active" }
{ "kind": "navigate", "reason": "reload",   "t": 25553, "url": ".../todomvc/#/active" }
{ "kind": "navigate", "reason": "navigate", "t": 36898, "url": "https://todomvc.com/"  }
```

### What's still open in M5 (in order)

- **v0.5.4** — Trace summary preview in popup + "review before sharing" warning. Optional network capture (debatable; could defer to M6-enables).
- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.
