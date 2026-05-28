# v1.7

## v1.7.1 — Side Panel Scaffold (2026-05-28)

### Problem

v1.7.0 locked the design: the popup is being replaced by Chrome's native side panel as the single webspec surface. v1.7.1 is the foundational patch — scaffold the side panel entry, wire it up so the toolbar icon opens it instead of the popup, and keep the popup HTML alive during the transition (v1.7.3 retires it fully). Without this scaffolding none of the later v1.7 view migrations have a target to land in.

### Solution

Three pieces:

**1. Manifest + Chrome Side Panel API.** `packages/chrome-extension/manifest.config.ts` gains:

```ts
side_panel: { default_path: 'src/sidepanel/index.html' }
permissions: [..., 'sidePanel']
```

`action.default_popup` stays declared so the popup HTML continues to bundle and remain a valid Chrome surface — at runtime the service worker calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, which makes the side panel win on icon-click. The popup is reachable programmatically until v1.7.3 retires it.

**2. Side panel entry — `packages/chrome-extension/src/sidepanel/`.** Three files:

- `index.html` — minimal Vite entry, same shape as the popup's, includes a viewport meta tag for the side panel's variable width.
- `main.tsx` — mounts the existing `popup/App.tsx` inside a `<div class="sidepanel-shell">` wrapper. Imports the popup's CSS plus a sidepanel-specific override.
- `sidepanel.css` — overrides the popup's `body { max-width: 480px }` clamp that made sense for a floating popup; in a side panel the frame width is set by Chrome (user-resizable), so the content fills. The `.sidepanel-shell` wrapper scopes these overrides without forking `popup.css` (which the popup entry still uses verbatim during the v1.7.1–v1.7.3 transition).

For v1.7.1, the side panel renders **exactly the same React app** the popup did. No view-migration work yet — that's v1.7.2 (audit + save) and v1.7.3 (settings + queues). The point is to land the surface itself so subsequent patches have a home.

**3. Service worker — flip icon-click to side panel.** `packages/chrome-extension/src/service-worker/index.ts` adds a top-level guard around `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. Setting it on every service-worker wake (no event listener needed) is the idiomatic Chrome guidance — `setPanelBehavior` is idempotent and survives the service worker's ephemeral lifecycle. Guarded for older Chrome where `chrome.sidePanel` doesn't exist (Chrome 114+ only); failures log a warning rather than throwing.

**Build verification.** `pnpm --filter @webspec/chrome-extension build` produces:
- `dist/src/sidepanel/index.html` (the side panel entry)
- `dist/manifest.json` containing both `action.default_popup` and `side_panel.default_path` + the `sidePanel` permission
- The popup, settings, report, and queue assets remain unchanged from v1.6.6

No runtime test coverage added — this is pure configuration and a render-the-same-thing pass. The existing 470-test suite still passes (no logic changes). v1.7.2+ patches will add coverage as views move out of `popup/` into sidepanel-native components.

### New

- `packages/chrome-extension/src/sidepanel/index.html` — Vite entry for the Chrome Side Panel surface.
- `packages/chrome-extension/src/sidepanel/main.tsx` — React mount, reuses `popup/App.tsx` inside a `.sidepanel-shell` wrapper.
- `packages/chrome-extension/src/sidepanel/sidepanel.css` — overrides the popup's narrow-column max-width.

### Changed

- `packages/chrome-extension/manifest.config.ts` — adds `side_panel.default_path` + the `sidePanel` permission. `action.default_popup` retained.
- `packages/chrome-extension/src/service-worker/index.ts` — calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` on wake; guarded for Chrome < 114.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/manifest.config.ts` | **Edit** — adds side panel entry + `sidePanel` permission. |
| `packages/chrome-extension/src/service-worker/index.ts` | **Edit** — `setPanelBehavior` for icon-click. |
| `packages/chrome-extension/src/sidepanel/index.html` | **New** — Vite entry. |
| `packages/chrome-extension/src/sidepanel/main.tsx` | **New** — React mount, reuses `popup/App.tsx`. |
| `packages/chrome-extension/src/sidepanel/sidepanel.css` | **New** — layout overrides. |
| `Versions/v1/v1.7/release-notes.md` | This entry. |

### Known issues / notes

- **Same React app as the popup.** This patch lands the surface; it doesn't change behavior. Clicking the icon now opens the side panel (not the popup) but the same Audit / Record / Save / Settings buttons appear inside. View migrations (v1.7.2+) make the side panel context actually useful — for now you can resize the panel and it stays open while you work the page, which is the qualitative win.
- **Manual reload required.** After pulling v1.7.1 and rebuilding, the unpacked extension needs a reload at `chrome://extensions` for the new manifest to apply. Standard for any manifest change.
- **Popup still ships.** The popup HTML continues to bundle. Programmatic `chrome.action.openPopup()` calls and any callers that depend on the popup surface still work. v1.7.3 will remove the popup entry from the manifest + delete the source files.
- **No test coverage delta.** Existing 470 tests still pass. The side panel render is a config + scaffolding change; render parity with the popup is verifiable by inspection (same React tree, same CSS, sidepanel-shell wrapper for width override).

## v1.7.0 — Recorder UX Overhaul Design (2026-05-28)

### Problem

v1.6 shipped working code for parametric Test Cases and wired Queues — static + integration coverage all green. In-browser manual verification (paused at issue #61) surfaced a real product issue: the v1.6.2 promote-picker and v1.6.3 wiring dropdown shift work onto the human that webspec's mission says the tool should do. Rob's phrase: *"this is nonsense work that makes this tool unusable by a human."* Three-pillar mission (508 audit, stackable tests, render Playwright) puts the human in charge of *recording* and *reviewing*, not authoring CSS selectors and regex patterns for every Test Case. v1.7 closes the gap.

### Solution

Stub design doc `docs/11-recorder-ux-overhaul.md` covering four mutually-reinforcing pieces:

1. **Side panel = single surface.** Replace popup with Chrome's native side panel (Chrome 114+). Persistent while user interacts with page; hosts Audit / Record / Save / Settings / Queues.
2. **Floating overlay during record.** Content-script overlay with live event feed + Stop button. No more "click extension icon mid-flow to stop."
3. **Auto-proposed I/O at record-stop.** Tool examines recording + final page state, proposes inputs (promotable fills) + outputs (URL extractions, text selectors). Save panel becomes a review surface, not authoring. LLM seam (BedrockAdapter) handles harder inference.
4. **Composer auto-wires.** Name-matching outputs → inputs across steps. UI only surfaces ambiguities and unresolved cases. v1.6.3 manual dropdown becomes the escape hatch, not the default path.

Stub also includes a draft v1.7.1–v1.7.7 patch plan (side panel scaffold → view migrations → floating overlay → auto-I/O → auto-wire → LLM fallback → integration tests) and an "Out of scope for v1.7" list preserving the v1.6 constraints (whole-value substitution, no per-iteration variation, AI variation amplification still the next-after milestone).

This patch is the design *stub* — locked decisions land into this doc as the design conversation proceeds. Same shape as v1.6.0 (which stubbed `docs/10` § "v1.6 design" before any code).

Tracking issue: #62 (P1, umbrella for v1.7).

### New

- `docs/11-recorder-ux-overhaul.md` — design stub.

### Changed

- N/A.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `docs/11-recorder-ux-overhaul.md` | **New** — v1.7 design stub. |
| `Versions/v1/v1.7/release-notes.md` | This entry. |

### Known issues / notes

- **Stub only.** The design isn't locked yet — each section has open questions that get resolved in conversation. Per-piece patches (v1.7.1+) wait for those locks.
- **Rip-out scope.** v1.7.5 retires the v1.6.2 promote-picker; v1.7.6 demotes the v1.6.3 manual wiring dropdown to an unresolved-only escape hatch. The v1.6 schema (`RecordingInput` / `RecordingOutput` / `QueueStep.inputValues`) stays — who populates the fields changes, not the contract artifact.
- **Verification of v1.6 still useful.** Issue #61 (finish v1.6 manual verification) stays P1 — confirming the current code is functional before ripping its UX. Less risk of conflating "the v1.6 mechanism is broken" with "the v1.6 UX is wrong."
