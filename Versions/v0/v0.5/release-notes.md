# v0.5

## v0.5.4 — Trace Preview And Share Warning (2026-05-11)

### Problem

Stopping a recording immediately downloaded the JSON file. Users had no idea what they'd captured until they opened the file — they couldn't see at a glance how long it was, what kinds of events were in it, what URLs were touched, or whether anything they'd typed had been recorded. Worse, there was no chance to bail out: if they realized mid-flow they'd typed something they didn't want to share, the file was already on disk. The recorder needs to give users a deliberate review step before anything is written.

### Solution

Decouple Stop from Download. Clicking **■ Stop recording** now holds the recording in popup state and renders a summary panel. The panel shows duration, total event count with a per-kind breakdown, the URL trail (start URL plus every `navigate` event with its `reason` tag), and a warning callout reminding the user that what they typed is in the recording (passwords masked, everything else as-is). Two buttons:

- **Download recording** — runs the existing `downloadJson` flow, leaves a "Saved …" confirmation in its place.
- **Discard** — clears state without writing a file.

Closing the popup before clicking either keeps the recording in memory (popup state) until next interaction. The recorder itself is fully stopped at this point — the only thing alive is the popup's React state holding the candidate file.

### New

- `packages/chrome-extension/src/popup/summary.ts` — pure `summarizeRecording(recording)` and `formatDuration(ms)` helpers. Computes duration, event count, per-kind counts, URL trail (with `start | navigate | reload | history | hash` tags), and a `hasUserInput` flag for the warning copy.
- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` — the post-stop panel. Renders the stats, a collapsible URL trail with reason chips (color-coded for `reload` and `navigate`), the share warning, and the Download / Discard actions.
- New `RecorderStatus` variants in `App.tsx`: `'review'` (panel shown, decision pending), `'saved'` (after Download), `'discarded'` (after Discard).
- CSS for `.trace-panel` and its children in `packages/chrome-extension/src/popup/popup.css` — matches the existing dark/light `color-mix` palette and the report panel's typography conventions.

### Changed

- `packages/chrome-extension/src/popup/App.tsx` — `stopAndExportRecording` renamed to `stopAndReviewRecording`; it stops the recorder and moves to the `'review'` state without downloading. New `handleDownloadRecording` and `handleDiscardRecording` handlers drive the panel's buttons. Render block now picks between `RecordingSummaryPanel`, the success line, and the "Recording discarded" notice.
- Footer label bumped to `v0.5.4 — trace preview + share warning`.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/summary.ts` | New — recording-summary helpers (pure, popup-local). |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | New — review panel component with Download / Discard. |
| `packages/chrome-extension/src/popup/App.tsx` | Replace auto-download flow with review-then-download. New `'review' / 'saved' / 'discarded'` states. |
| `packages/chrome-extension/src/popup/popup.css` | Add `.trace-panel` styles (header, stats grid, URL trail, warning callout, action row). |
| `Versions/v0/v0.5.4/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: 147/147 tests still pass (no behavioral changes outside the popup). Type-check clean. Vite bundle clean.

#### Live smoke

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

#### What's still open in M5 (in order)

- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.
- Deferred (re-evaluated for M6-enables, not blocking M5): network capture via `chrome.webRequest`.

## v0.5.3 — Navigation Event Capture (2026-05-11)

### Problem

The recorder captured DOM events but said nothing about URL changes. A workflow that clicked a link, navigated to another page, and continued from there showed up as two unrelated sequences of clicks — no record of the navigation between them. v0.5.2 made state survive reloads, but the recording still had a silent gap where the navigation happened: no event marker, no indication that the URL changed, no signal a renderer could use to emit `page.waitForURL()` or `page.reload()`. The `RecordedEvent` schema already had a `kind: 'navigate'` shape from M1, but nothing was producing them.

### Solution

Wire `chrome.webNavigation` to the recorder. Three listeners in the service worker cover the four navigation kinds:

- `onCommitted` — cross-document loads (link clicks, form submits) and reloads.
- `onHistoryStateUpdated` — `pushState` / `replaceState` (SPA routing).
- `onReferenceFragmentUpdated` — fragment-only changes (hash routing).

Each fired event is checked against the session-state map (v0.5.2's broker). If the tab has an active recording, a `navigate` event is added with a `reason` field — `'navigate'`, `'reload'`, `'history'`, or `'hash'` — so a renderer at M6 can emit the right Playwright call (`waitForURL`, `reload`, or an assertion after an SPA route change).

**Two writers, no race.** Same-document navigations send a `recorder:append-event` message to the still-alive content script, which appends to its in-memory buffer and persists. Cross-document navigations happen at the moment the content script is being torn down — the service worker writes the event directly to storage instead, and the new content script's bootstrap on the new document picks it up. Each case has exactly one writer.

Distinguishing reload from cross-document load uses `details.transitionType === 'reload'` from `onCommitted`. The renderer treats them differently — reload → `page.reload()`, navigate → `page.goto(url)` or assertion after a click.

### New

- `reason` field on the `navigate` event in `packages/core/src/types/analysis.ts` — `z.enum(['navigate', 'reload', 'history', 'hash'])`. Required, not optional. Renderers will pattern-match on this to decide which Playwright primitive to emit.
- `RecorderAppendEventRequest` / `RecorderAppendEventResponse` message types in `packages/chrome-extension/src/shared/messages.ts` — service worker → content script push for same-document navigations. The response carries an `absorbed` flag so the SW knows whether to fall back to a direct storage write.
- `handleNavigation` in `packages/chrome-extension/src/service-worker/index.ts` — single entry point used by all three webNavigation listeners, branching on same- vs. cross-document and routing the event accordingly.
- `chrome.webNavigation.onCommitted` / `onHistoryStateUpdated` / `onReferenceFragmentUpdated` listeners in the service worker.
- `recorder:append-event` handler in the content script's message router — appends to the live buffer when a recording is in flight; reports `absorbed: false` when idle so the SW can fall back.

### Changed

- `packages/chrome-extension/manifest.config.ts` — add `webNavigation` permission. Users see the permission prompt on first reload of the unpacked extension.
- `packages/chrome-extension/src/service-worker/index.ts` — module docstring rolled forward to v0.5.3 scope; webNavigation handlers landed alongside the v0.5.2 session broker.
- `packages/chrome-extension/src/content-script/index.ts` — imports + message router extended; no changes to event-handler logic or session persistence.
- `packages/chrome-extension/src/shared/messages.ts` — scope comment rolled forward to mention the SW→CS push.

### Fixed

- Navigation between events is no longer invisible. A workflow that clicks a link and continues on the destination page now has a `navigate` event in the recording, with the destination URL and a `reason` tagging which Chrome navigation kind it was.
- Reloads during recording show up as their own typed events (`reason: 'reload'`), not silent gaps. Renderers can emit `page.reload()` faithfully.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add `reason` enum to the `navigate` event schema. |
| `packages/chrome-extension/manifest.config.ts` | Add `webNavigation` permission. |
| `packages/chrome-extension/src/shared/messages.ts` | Add `recorder:append-event` request/response types + guard. |
| `packages/chrome-extension/src/service-worker/index.ts` | Implement `handleNavigation`; wire three webNavigation listeners. |
| `packages/chrome-extension/src/content-script/index.ts` | Handle `recorder:append-event` in the message router. |
| `Versions/v0/v0.5.3/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: 147/147 tests still pass. Type-check clean (`tsc --noEmit` in core and chrome-extension). Vite bundle clean.

#### Live smoke

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

#### What's still open in M5 (in order)

- **v0.5.4** — Trace summary preview in popup + "review before sharing" warning. Optional network capture (debatable; could defer to M6-enables).
- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.

## v0.5.2 — Session State Persistence (2026-05-11)

### Problem

The recorder lived entirely in the content script's module-scope variables and `performance.now()`-relative timestamps. The moment the page reloaded — or the user clicked any link that triggered a fresh document — the content script was torn down and rebuilt, taking the recording with it. The popup's React state already handled its own transience via `hydrateRecorderStatus`, but it asked the content script for ground truth, and the content script had no truth left to give. v0.5.1 surfaced this loudly: every test of "what if I refresh the page mid-recording?" lost everything.

### Solution

Mirror the recording snapshot into `chrome.storage.session` on every event so it survives any content-script restart. The service worker brokers reads and writes because content scripts can't see their own `tab.id` — `sender.tab.id` is available only to the service worker, which uses it to key storage per tab. On (re)load, the content script asks the service worker for its tab's snapshot; if one exists, it restores in-memory state, rebinds event listeners, and resumes capturing.

Event timestamps switch from `performance.now()`-relative (resets to 0 on each new document) to wall-clock-relative (`Date.now() - recorderStartMs`) so the recording timeline stays coherent across reloads.

A subtle wrinkle showed up during the smoke: Manifest V3 service workers idle-terminate after ~30 seconds, and Chrome occasionally drops the first message that lands during a cold start. `bootstrapRecorder` retries up to three times with backoff so a reload after a long pause still restores. Without retries, the smoke would reproduce "Stop button is gone" on the second reload of a quiet recording — exactly the symptom we set out to fix.

### New

- `RecorderSessionState`, `RecorderSessionGet/Put/ClearRequest`, and matching response types in `packages/chrome-extension/src/shared/messages.ts` — typed protocol between the content script and the service worker.
- Service worker session broker in `packages/chrome-extension/src/service-worker/index.ts` — `getSession`, `putSession`, `clearSession` helpers backed by `chrome.storage.session`, keyed by `webspec:recorder:<tabId>`.
- `chrome.tabs.onRemoved` listener in the service worker — drops the snapshot when the tab closes, since `chrome.storage.session` doesn't garbage-collect on its own.
- `bootstrapRecorder()` in the content script — runs at module load, queries the service worker, restores state and rebinds listeners if a recording was in flight. Retries up to three times with backoff (50ms / 100ms / 150ms) to survive service-worker cold starts.
- `persistSession()` helper — fires after every event handler, pushing the latest snapshot to the service worker. Fire-and-forget: the next event re-persists, so a dropped write self-heals.
- `addRecorderListeners()` / `removeRecorderListeners()` helpers — extracted so bootstrap can rebind the same handler set the start path uses, with no chance of drift.

### Changed

- `packages/chrome-extension/src/content-script/index.ts` — replace `performance.now()`-relative timestamps with `Date.now() - recorderStartMs`. `startRecorder` now persists on start and `stopRecorder` clears the session. Every event handler calls `persistSession()` after pushing (or coalescing, in the input case). The message router awaits a module-level `bootstrapPromise` before answering recorder queries so a popup status query that arrives during the async restore still sees the resumed state.
- `packages/chrome-extension/src/service-worker/index.ts` — no longer a v0.3.7 scaffold; now hosts the session broker and the tab-removed cleanup listener.

### Fixed

- Recording state survives page reload. Cmd+R on the active tab during a recording no longer drops events or the Stop button; the popup correctly re-hydrates.
- Stop button reappears across multiple consecutive reloads. The retry-with-backoff in `bootstrapRecorder` covers the service-worker idle-termination case that v0.5.1's design didn't account for.
- Event timestamps are coherent across reloads — a recording spanning a reload now reports monotonically-increasing `t` values, not a reset to near-zero after the reload.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/messages.ts` | Add `RecorderSessionState` + `recorder:session:get/put/clear` request/response types and guards. |
| `packages/chrome-extension/src/service-worker/index.ts` | Implement the session broker over `chrome.storage.session`. Clear per-tab state on `chrome.tabs.onRemoved`. |
| `packages/chrome-extension/src/content-script/index.ts` | Switch to wall-clock timestamps. Add `bootstrapRecorder` (with retry/backoff), `persistSession`, and the listener-add/remove helpers. Persist after every event. Await bootstrap in the message router. |
| `Versions/v0/v0.5.2/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: 147/147 tests still pass (no test changes in this version). Type-check clean (`tsc --noEmit`), extension Vite bundle clean.

#### Live smoke

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

#### What's still open in M5 (in order)

- **v0.5.3** — Navigation event capture (`chrome.webNavigation.onCommitted`). Now that state survives reloads, recordings can span same-origin navigations cleanly; the next step is recording the navigation itself as a typed `RecordedEvent` so renderers can emit `page.waitForURL()` / verify navigation.
- **v0.5.4** — Trace summary preview in popup + "review before sharing" warning.
- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.

## v0.5.1 — Hardened Recorder Selectors (2026-05-11)

### Problem

v0.5.0 broadened the recorder's event capture but every selector still used the basic CSS strategy (`tag#id.class`). On real pages that produces selectors like:

```json
{ "preferred": "a", "strategy": "css", "fallbacks": [] }
```

— matching every anchor on the page, useless for replay. The TodoMVC smoke at v0.5.0 surfaced this directly: all three filter links recorded as just `"a"`, surviving only because `targetText` was unique. M6's Playwright renderer can't produce reliable specs from selectors that brittle, so this had to land before we move on.

Re-running the smoke against the first cut of hardened selectors surfaced two more problems that had to land in the same version:

1. **Per-keystroke noise.** Typing `"buy a cat"` into the new-todo input produced nine separate `input` events (one per character) plus a focusing `click`, and toggling a checkbox produced both a redundant `click` and the meaningful `change` — a 35-event recording for an 11-action walkthrough.
2. **Ambiguous selectors.** TodoMVC has three checkboxes all named "Toggle Todo". The role+name strategy collapsed them to one identical selector, so toggling different todos was indistinguishable in the recording.

### Solution

Hardened-selector synthesis at capture time, matching Playwright's own codegen priority order:

1. **`data-testid`** (plus `data-test-id`, `data-test`, `data-cy`, `data-qa` variants) → `strategy: 'testId'`. Most stable: only changes if a dev deliberately renames the attribute.
2. **ARIA role + accessible name** → `strategy: 'role'`. Survives markup restructuring as long as user-visible semantics stay constant. Playwright's recommended default.
3. **Visible text** → `strategy: 'text'`. Survives until the copy changes.
4. **Basic CSS** → `strategy: 'css'`. Last resort, what we shipped in v0.5.0.

Each `HardenedSelector` carries a `preferred` string in Playwright's own selector engine syntax (`role=link[name="Active"]`, `text="Active"`, `[data-testid="…"]`) and a `fallbacks[]` array of weaker alternatives. M6's renderer pattern-matches the prefix to emit the right `getByRole` / `getByText` / `locator` form; if the preferred selector misses at replay, the renderer (or a future replay UI) can degrade through the fallbacks.

The accessible-name computation implements a pragmatic subset of the W3C Accessible Name spec:

- `aria-labelledby` (resolves the points-to chain, joins textContent)
- `aria-label`
- `<label for>` and wrapping `<label>` association for form controls (via `el.labels`)
- `placeholder` and `title` fallback for inputs
- `textContent` for buttons and links (per spec, the visible text *is* the name)

Names are normalized (whitespace collapsed) and truncated to 80 chars so we don't bake war-and-peace strings into recordings.

**Disambiguation.** When the preferred selector matches more than one element on the page (TodoMVC's three "Toggle Todo" checkboxes, identical CSS fallbacks, etc.), we append a Playwright `>> nth=N` positional suffix to the preferred string so each event uniquely targets its element. Applied to `testId`, `role`, and `css` strategies. Deliberately *not* applied to `text` strategy: text content bubbles through ancestors (a link's text matches its parent `<ul>` too), so an nth suffix there could mis-target on replay.

**Event dedup at capture time.** Three rules collapse multi-event browser sequences into the single user action they represent:

- **Coalesce contiguous keystrokes.** Successive `input` events on the same field (same `selector.preferred`) merge into one event holding the final value. Any intervening event (Enter, Tab, click elsewhere) breaks the run — the next typing session starts fresh.
- **Drop the focusing click.** A `click` immediately followed by an `input` on the same selector is dropped: Playwright's `fill()` focuses on its own.
- **Drop the redundant toggle click.** A checkbox/radio click fires both `click` and `change` events on the same element within milliseconds. The `change` carries the new checked state, so the preceding `click` is dropped — one physical action yields one recorded event.

End-to-end effect on the TodoMVC smoke: a recording that produced 35 events in the v0.5.1 first cut now produces 14 — and the 14 are all meaningful.

### New

- `buildHardenedSelector(el: Element): HardenedSelector` in `packages/chrome-extension/src/content-script/selectors.ts`.
- Helper functions: `findTestId`, `computeRole`, `computeAccessibleName`, `visibleText`, `collectFallbacks`.
- `disambiguateRole` and `disambiguateCss` helpers — append `>> nth=N` when a preferred selector matches multiple elements on the page.
- `IMPLICIT_ROLES` and `IMPLICIT_INPUT_ROLES` tables mapping common HTML tags / input types to ARIA roles.
- 21 hardened-selector tests in `packages/chrome-extension/tests/selectors.test.ts` using `happy-dom`.
- `happy-dom` workspace devDep for DOM-aware tests (lighter than jsdom; Node 18-compatible).
- `tests/` added to `packages/chrome-extension/tsconfig.json` include list.

### Changed

- `packages/chrome-extension/src/content-script/index.ts` — `selectorFor` now returns a full `HardenedSelector` via `buildHardenedSelector`. Three dedup rules added to event handlers: contiguous `input` events on the same field coalesce into one, a `click` followed by `input` on the same selector is dropped (focus is redundant under `fill()`), and a `click` immediately preceding a `change` on a checkbox/radio is dropped (one physical action → one event). Module docstring refreshed to reflect the new scope.
- `packages/chrome-extension/src/popup/App.tsx` — footer label bumped.
- Public surface of `selectors.ts` — `buildBasicSelector` is still exported as the css-strategy implementation, but the recorder no longer calls it directly.

### Fixed

- TodoMVC-style filter links no longer record as the unparseable `"a"` selector. The new-todo input no longer records as `"input.new-todo"` (which would break the moment a CSS module renames the class) — it records as `role=textbox[name="What needs to be done?"]`, which Playwright can resolve via `getByRole` and will survive class renames and wrapper-div refactors.
- The toggle checkbox at `input.toggle` similarly becomes `role=checkbox[name="<associated label>"]`, decoupling the recording from a stylesheet-internal class name.
- Identical role+name selectors no longer collapse multiple distinct elements into one. Toggling todo 1 vs. todo 2 in TodoMVC now produces `role=checkbox[name="Toggle Todo"] >> nth=0` vs. `>> nth=1` rather than two identical strings.
- Typing a sentence into a form field no longer produces one event per keystroke — the recording stores the final value as a single `input` event.
- Toggling a checkbox no longer produces a duplicate `click` + `change` pair — only the state-bearing `change` event survives.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/content-script/selectors.ts` | Add hardened-selector synthesis (testId / role+name / text / css priority order) with `>> nth=N` disambiguation for non-unique selectors. Keep `buildBasicSelector` as the css-strategy primitive. |
| `packages/chrome-extension/src/content-script/index.ts` | Recorder now calls `buildHardenedSelector`; add input-coalescing, focus-click, and toggle-click dedup rules. Refresh module docstring to v0.5.1 scope. |
| `packages/chrome-extension/src/popup/App.tsx` | Footer label → v0.5.1. |
| `packages/chrome-extension/tests/selectors.test.ts` | 21 new tests covering priority order, accessible-name sources, implicit roles, text normalization. |
| `packages/chrome-extension/tsconfig.json` | Include `tests/**/*` so the editor type-checks tests. |
| `package.json` | Add `happy-dom` workspace devDep. |
| `Versions/v0/v0.5.1/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **147/147 tests pass** (126 prior + 21 new selector tests), library build clean, extension Vite bundle clean (~590 KB content-script bundle, ~3 KB larger than v0.5.0 — the cost of the role/name computation).

#### Live smoke

1. `make ext-build` (or `make ci`).
2. Reload the webspec card in `chrome://extensions`.
3. Hard reload `https://demo.playwright.dev/todomvc` (Cmd+Shift+R).
4. Click **Record workflow** → type a todo, press Enter, check it off, click the **Active** filter, click **Clear completed** → **■ Stop recording**.
5. Open the downloaded `recording-*.json`. Look at the selectors — every selector with text content should now carry `strategy: 'role'` or `'text'`, with `preferred` like:
   - `role=textbox[name="What needs to be done?"]` (the new-todo input)
   - `role=checkbox[name="Toggle Todo"] >> nth=0` (the first toggle)
   - `role=link[name="Active"]` / `role=link[name="Completed"]` (the filter links)
   - `role=button[name="Clear completed"]` (the clear button)
6. **`fallbacks` arrays** should be populated for non-css strategies — the renderer at M6 will use these if the preferred selector misses.
7. **Event count.** A walkthrough of "type three todos, toggle two, click Active / Completed / Clear completed" produces ~14 events — one `input` per todo (final value), one `change` per toggle (no duplicate `click`), and one `click` per navigation. Per-keystroke noise (~30 events for the typing alone) is gone.

#### What's still open in M5 (in order)

- **v0.5.2** — Navigation event capture + state persistence in `chrome.storage.session`.
- **v0.5.3** — Trace summary preview in popup + "review before sharing" warning; network capture if we want it in M5 (debatable; could defer to M6-enables).
- **v0.6.0** — Verification on 3 deployed sites + audit-parity check vs CLI. M5 done; ready for M6.

## v0.5.0 — Recorder Events + Best Practice Rules (2026-05-11)

### Problem

Three gaps after v0.4.2:

1. **The recorder only captured clicks.** A real workflow — fill a form, hit a select, press Enter to submit — produced an event trace with just the clicks, missing the field values and the submit. Useless to M6 (Playwright rendering).
2. **The audit ran WCAG 2.1 AA + Section 508, but dropped axe's `best-practice` tag at the contract boundary.** That excluded ~30 hygiene rules that human a11y reviewers tend to flag too: `landmark-one-main`, `region`, `page-has-heading-one`, `heading-order`, etc. Easy automated coverage we were leaving on the floor.
3. **The popup couldn't stop an in-progress recording.** Chrome popups are transient — they unmount when you click away. The popup's React state reset to `idle` on every reopen, even though the content-script recorder was still capturing. The "Stop recording" button label never appeared because the popup didn't know it was recording. Effectively: you could start a recording but never end it without reloading the page. Shipped that way since v0.4.1; surfaced during v0.5.0 smoke.

### Solution

Two cosmetic-feeling changes; one is real plumbing.

**Recorder broadens to five event types** (`click` already shipped; `input`, `change`, `submit`, `keydown` are new). Each routes through one capture-phase listener that pushes a typed `RecordedEvent` variant. Password fields auto-mask (value blanked, `sensitive: true`). `keydown` filters to workflow-significant keys only (Enter/Tab/Escape/Arrows/Page/Home/End) — character typing flows through `input` instead, so we don't double-capture.

**axe-core gets the `best-practice` tag added** to the input set, and `best-practice` becomes a first-class rule-set tag in the contract. Renderers (both the markdown one and the report-tab one) surface a "Best practice" badge wherever WCAG and 508 badges already render. Zero per-audit cost; the rules were already there in axe — we just stopped throwing them away.

**Vision-based alt-text quality is NOT in this PR.** Considered it, weighed it against the cost-per-audit math (real money per scan once we add a multimodal call), and decided to bank it for a future Pro tier. Documented in `docs/99-open-questions.md` so it's not lost.

**Popup state rehydrates from the content script.** New `recorder:status` message: the popup sends it on mount, the content script returns whether a recording is in progress (+ `startedAt`, `startUrl`, current `eventCount`). If recording, the popup hydrates React state to `kind: 'recording'` so the button reads "■ Stop recording" and the banner shows. Without this, the v0.5.0 broader event capture would have been unreachable in practice.

### New

- `'best-practice'` value on `A11yRuleTagSchema` enum; `DEFAULT_A11Y_TAGS` and `SURFACED_TAGS` both include it.
- Content-script handlers: `handleInput`, `handleChange`, `handleSubmit`, `handleKeydown` with selector helper `selectorFor`.
- `SIGNIFICANT_KEYS` constant defining which keydown events get captured.
- `recorder:status` message + `getRecorderStatus()` in the content script; `hydrateRecorderStatus()` helper in the popup that runs once on mount.
- Open-questions entry parking vision-based alt-text / link-text / heading-outline LLM checks as a post-v1 Pro tier feature.

### Changed

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

### Fixed

- **Recording is actually stoppable.** Pre-v0.5.0, closing the popup mid-recording reset the popup's React state to `idle` on next open — the "Stop recording" button label never reappeared even though the content script was still capturing. The new `recorder:status` round-trip rehydrates the popup from ground truth on mount, so the button correctly reads "■ Stop recording" and the recorder banner reappears. Reload-the-page was the only previous workaround, and it threw away all captured events.
- Form-fill workflows are now actually recordable. Pre-v0.5.0 the recorder dropped every keystroke and every select change; the resulting trace would replay as "click the Submit button on an empty form."
- Password values can't accidentally end up in a recording. `<input type="password">` masks the value at capture time and flags `sensitive: true` so the rendered Playwright spec can decide whether to use a fixture or prompt at runtime.
- Audit reports against typical sites will now show `landmark-one-main` / `region` / `page-has-heading-one` violations that pre-v0.5.0 the report claimed didn't exist — they were running in axe but being dropped before the contract.

### Files Changed

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

### Verification

`make ci` green: lint clean, **126/126 tests pass**, library build clean, extension Vite bundle clean.

#### Live smoke

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

#### What's not in this PR (intentional)

- **`navigate` events.** Capturing SPA navigation needs `popstate` / `pushState` hooks and a separate handler for cross-document loads. Not needed yet for the first M6 spike since Playwright can re-derive URL changes from the trace context.
- **Hardened selectors** (`data-testid` > role+name > text > css). Still on `buildBasicSelector` for now; the selector strategy upgrade is a separate PR.
- **Network capture** and **state persistence across popup close**. Both pending; tracked in the M5 task list.
- **LLM-amplified a11y judgments.** Parked at `docs/99-open-questions.md` — feature flagged for a future Pro tier so it doesn't lock the baseline to a per-audit cost.

