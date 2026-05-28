# v1.7

## v1.7.2 — Auto-Proposed Inputs at Save (2026-05-28)

### Problem

v1.6.2 shipped the Save panel with empty Inputs + Outputs sections; the user had to manually check every recorded fill, type a name, and hand-author CSS selectors and URL regexes for outputs. Verifying that flow on 2026-05-28, Rob's phrase was *"this is nonsense work that makes this tool unusable by a human."* v1.7 (designed in `docs/11`) reframes the Save panel as a **review** surface — the tool examines the recording and proposes inputs; the user reviews. v1.7.2 is the first concrete delivery of that reframe.

### Solution

New `packages/chrome-extension/src/popup/io-proposal.ts` — a pure helper that derives a sensible default `RecordingInput[]` from a recording.

**`proposeInputsFromRecording(recording)`** walks `recording.events[]` and emits one input per promotable event:
- `input` events with non-empty, non-sensitive values → promotable.
- `change` events on `<select>` (where `options !== undefined`) with non-empty values → promotable.
- Sensitive `input` (passwords), empty values, and checkbox/radio `change` events are skipped. The v1.6.4 known issue (checkboxes can't be parameterized under v1.6's whole-value substitution model) no longer reaches the proposal — fixed at the source.

**`suggestNameFromSelector(selector)`** derives a JS-identifier name from the selector's `preferred` string. Precedence:
1. `role=ROLE[name="Human Name"]` — the natural-language field label (matches Playwright's role+name pattern). `"Lead Name"` → `leadName`.
2. `#identifier` — element id. `#lead-name` → `leadName`.
3. `[data-*="value"]` — test/automation attributes. `[data-test-id="email-field"]` → `emailField`.
4. `[name="value"]` — form name attribute. `[name="lead_name"]` → `leadName`.
5. `[placeholder="value"]` — placeholder text. `[placeholder="Enter email"]` → `enterEmail`.
6. Fallback: `"input"`.

camelCase conversion handles spaces, hyphens, underscores; results starting with a digit get prefixed with `input` so the rendered helper signature stays a valid JS identifier (matches `io-authoring.ts`'s `IDENT_RE`).

Names are **uniquified per-recording** via a `Set<string>` accumulator: a second field with the same suggested base name becomes `name2`, third `name3`, etc.

**`RecordingSummaryPanel.tsx`** is the only other change: the `useState<RecordingInput[]>` initializer switches from `recording.inputs ?? []` to `recording.inputs && recording.inputs.length > 0 ? recording.inputs : proposeInputsFromRecording(recording)`. Re-opening a Test Case saved with explicit inputs respects them; a fresh recording arrives with the proposed defaults already populated.

**End-user effect.** On Stop, the Save panel's Inputs section is already populated:
- Each promotable fill appears with its checkbox **pre-checked**.
- The name field is **pre-filled** with the suggested camelCase name.
- User reviews. Unchecking removes a row from `inputs`. Editing the name updates in place.
- Save validation still applies (duplicate names, empty names, invalid identifiers) — the auto-propose pipeline produces valid identifiers by construction, but typos during review still error correctly.

**Outputs are unchanged in v1.7.2.** Auto-proposing outputs (URL regex inference from URL changes, text-source inference from new DOM nodes) is the next patch — v1.7.3.

**Tests.** 18 new cases in `packages/chrome-extension/tests/io-proposal.test.ts`. 488/488 tests passing (was 470).

### New

- `packages/chrome-extension/src/popup/io-proposal.ts` — auto-propose helper + name suggestion.
- `packages/chrome-extension/tests/io-proposal.test.ts` — 18 unit tests.

### Changed

- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` — seeds `inputs` state from the proposal when none are already declared.

### Fixed

- N/A — additive UX shift, not a bug fix.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/io-proposal.ts` | **New** — auto-propose helper. |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | **Edit** — seed `inputs` state from proposal. |
| `packages/chrome-extension/tests/io-proposal.test.ts` | **New** — 18 tests. |
| `Versions/v1/v1.7/release-notes.md` | This entry. |

### Known issues / notes

- **Manual review surface unchanged.** The v1.6.2 `IOAuthoringPanel` still renders all fill events as rows; pre-proposed rows are checked + name-filled. The user can still manually check unproposed rows (e.g. sensitive fields) if they really want to — the auto-propose narrows candidates but doesn't restrict the UI.
- **Outputs still empty by default.** v1.7.3 delivers auto-proposed outputs.
- **No LLM round-trip yet.** Heuristic-only inference. LLM fallback for harder cases (labels in sibling elements, multilingual UIs) is queued for a later patch.
- **Patch plan reordered.** Today's order: v1.7.2 inputs propose → v1.7.3 outputs propose → v1.7.4 composer auto-wire → v1.7.5 floating overlay → v1.7.6 LLM fallback. View migrations / popup retirement deferred to v1.7.7+.

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
