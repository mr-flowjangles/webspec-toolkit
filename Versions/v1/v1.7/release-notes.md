# v1.7

## v1.7.5 — Side Panel Tab Error Reset (2026-05-28)

### Problem

The side panel introduced in v1.7.1 persists across tab switches inside a Chrome window (that's the side-panel API contract — one panel per window, not per tab). v1.7.0's popup-era recorder kept a "webspec only works on http(s) pages" error in state when the active tab wasn't a regular page. In the popup that was harmless: the popup closes on every blur, so the next open mounts fresh. In the side panel that error stuck around forever — even after the user navigated to a real http(s) page, the panel still showed the error and refused to record. Reproduced live during v1.7.4 verification.

### Solution

New `useEffect` in `popup/App.tsx` subscribes to `chrome.tabs.onActivated` + `chrome.tabs.onUpdated` (URL-change events only). On either signal, recorder/audit state in `kind: 'error'` is reset to `kind: 'idle'`. All other states (recording, review, saved, naming) are preserved — the listener only clears stale errors.

### Fixed

- Side panel showing "webspec only works on http(s) pages" persists after switching to an http(s) tab.
- Audit error state similarly clears on tab switch (same pattern, same hook).

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/App.tsx` | New `useEffect` listening to `chrome.tabs.onActivated` and `chrome.tabs.onUpdated`; resets `recorder` and `audit` from `'error'` → `'idle'` on tab/URL change. |

## v1.7.4 — Composer Auto-Wire by Name (2026-05-28)

### Problem

v1.6.3 made the Queue composer surface a per-step **Inputs** subsection with a mode dropdown (constant / from earlier step). Even with v1.7.2 + v1.7.3 auto-proposing the Save panel, the *composer* still required the user to manually switch each input to "from earlier step" and pick the source. For obvious cases ("step 2 needs `leadName`; step 1 produces `leadName`") that's still manual work. v1.7.4 finishes the reframe: matching-name outputs wire themselves; the UI surfaces only ambiguities.

### Solution

New `autoWireInputs(declaredInputs, availableOutputSources, currentWiring?)` in `packages/chrome-extension/src/settings/queue-input-wiring.ts`. Rules:

- **Exactly one match:** emit `{ mode: 'output', step, outputName }` wiring.
- **Multiple matches (ambiguity):** skip; user disambiguates in UI.
- **Zero matches:** skip; user supplies a constant or marks unresolved.
- **Pre-existing entry in `currentWiring`:** respect it. Auto-wire never overwrites the user's explicit choice.

Strict name match — no fuzzy / Levenshtein. v1.7 MVP locks behavior at the strict end; relaxation is reversible.

**`QueuesPanel.tsx`** extracts `applyAutoWire(steps, idx)` that re-derives one step's `inputValues` by running the auto-wire pipeline. Both `pickTestCase` and `addStep` call it after mutating the steps array:

- **Picking a Test Case on a step** — matching-name inputs wire automatically; non-matching inputs stay unset (existing UI still shows the mode dropdown for the user to constant-fill).
- **Adding a new step** — auto-wire runs on the newly-pushed step against prior steps' outputs.

**End-user effect.** Composing a two-step Queue where step 1 (`create-lead`) declares output `leadName` and step 2 (`update-lead`) declares input `leadName`:

- **Before v1.7.4:** add step 2 → pick `update-lead` → click mode dropdown → switch to `from earlier step` → pick `step 1 → leadName`. Four interactions.
- **After v1.7.4:** add step 2 → pick `update-lead` → Inputs section shows `leadName` already wired to `step 1 (create-lead) → leadName`. Zero interactions.

The user's hand never touches the mode dropdown for the obvious case. Disambiguation (two earlier steps producing `leadName`) still surfaces — those rows arrive unset; the user picks.

**Tests.** 6 new cases in `packages/chrome-extension/tests/queue-input-wiring.test.ts`. 504/504 tests passing (was 498).

### New

- `autoWireInputs` helper.
- 6 new tests covering the five rules + multi-input case.

### Changed

- `packages/chrome-extension/src/settings/QueuesPanel.tsx` — `applyAutoWire` post-process on `pickTestCase` and `addStep`.

### Fixed

- N/A — additive UX shift.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/settings/queue-input-wiring.ts` | **Edit** — `autoWireInputs` (~50 lines added). |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | **Edit** — `applyAutoWire` integration. |
| `packages/chrome-extension/tests/queue-input-wiring.test.ts` | **Edit** — +6 cases. |
| `Versions/v1/v1.7/release-notes.md` | This entry. |

### Known issues / notes

- **Strict name match only.** No fuzzy matching (`lead_id` vs `leadId`, `lead-name` vs `leadName`). The v1.7.2 auto-propose pipeline emits camelCase identifiers consistently, so within a webspec-authored Queue the names align by construction; cross-author or hand-edited recordings may need a fuzzy pass — LLM-fallback patch can handle it.
- **Ambiguity always punts to UI.** When two earlier steps produce the same output name, auto-wire emits nothing — user picks. Intentional.
- **Composer UI unchanged.** The mode dropdown + source picker from v1.6.3 still render the same; they just appear pre-wired when a match exists.

## v1.7.3 — Auto-Proposed Outputs at Save (2026-05-28)

### Problem

v1.7.2 closed half of the Save-panel reframe: inputs are now pre-proposed. Outputs still required the user to click `+ add output`, pick the source kind, and hand-author a CSS selector or URL regex. v1.7.3 closes the other half: detect URL changes during the recording and propose URL-source outputs automatically.

### Solution

Extends `io-proposal.ts` with `proposeOutputsFromRecording(recording)`. Walks `recording.events` for `navigate` events; uses the LAST one as the "final URL" and compares against `recording.startUrl`. If a new ID-shaped segment appears, propose a URL-source output.

**Heuristic — `extractUrlIdSegments(start, final)`.** Regex: `/([#/])\/?([a-z][a-z0-9_-]*)\/(\d+)/gi` — separator + optional slash + alphabetic context word + slash + digits.

For each match:
- Skip if the full matched substring already exists in `startUrl` (the ID was pre-existing, not introduced by the recording).
- Singularize the context word (`leads` → `lead`, `categories` → `category`).
- Compose name: `<singular>Id` (e.g. `leadId`, `userId`).
- Build pattern: hash routes get `#/<context>/(\\d+)`; path segments get `/<context>/(\\d+)`. The context is regex-escaped.
- Uniquify if multiple segments yield the same name (`leadId`, `leadId2`).

**The lead-form fixture's shape** (start `…/lead-form.html`, end `…/lead-form.html#/lead/1`) round-trips to:

```ts
{ name: 'leadId', source: { kind: 'url', pattern: '#/lead/(\\d+)' } }
```

That's the exact pattern v1.6.5's integration test hand-authored — confirming the heuristic produces what the rendered helper needs to extract via `page.url().match(/#\/lead\/(\d+)/)?.[1] ?? ''`.

**`RecordingSummaryPanel.tsx`** — same shape as v1.7.2: the `useState<RecordingOutput[]>` initializer swaps from `recording.outputs ?? []` to the propose-when-empty path. Re-opening a Test Case respects its declared outputs; fresh recordings arrive with the URL output pre-populated when a navigation introduced an ID.

**End-user effect.** A workflow that creates a record (e.g. clicks Submit and navigates to `…/lead/42`) now opens the Save panel with the Outputs section already populated: `leadId` from the URL, ready to review. The user can edit the name, edit the pattern, or remove the row entirely — but they don't have to *start* by typing a regex.

**Naive singularizer.** Three rules: `-ies` → `-y` (queries/query), `-ses`/`-xes`/`-zes` → drop last 2 (boxes/box, classes/class), `-s` (not `-ss`) → drop last (leads/lead). Covers the common cases; false-positives on irregulars (`news`, `series`) produce slightly-off names that the user edits at review time. Not a full inflector — the user is the final review step.

**Scope intentionally narrow.** v1.7.3 only proposes:
- URL outputs.
- Numeric ID segments (path + hash route).

Deferred:
- Text-source outputs (would need a DOM snapshot at start + end — not currently captured).
- UUIDs, slugs, query-string params (heuristic loses signal fast outside numeric IDs).
- These all surface in the LLM-fallback patch later in v1.7.

**Tests.** 10 new cases in `packages/chrome-extension/tests/io-proposal.test.ts` covering the empty-navigates / no-change / lead-form / path-segment / singularization / nested-IDs / pre-existing-ID-skip / uniquification / last-nav-wins / UUID-skip behaviors. 498/498 tests passing (was 488).

### New

- `proposeOutputsFromRecording` + `extractUrlIdSegments` + `singularize` + `escapeRegex` helpers in `packages/chrome-extension/src/popup/io-proposal.ts`.
- 10 new tests in `packages/chrome-extension/tests/io-proposal.test.ts`.

### Changed

- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` — seeds `outputs` state from the proposal when none are already declared. Imports `proposeOutputsFromRecording`.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/io-proposal.ts` | **Edit** — outputs proposal pipeline (~80 lines added). |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | **Edit** — seed `outputs` state from the proposal. |
| `packages/chrome-extension/tests/io-proposal.test.ts` | **Edit** — +10 cases for `proposeOutputsFromRecording`. |
| `Versions/v1/v1.7/release-notes.md` | This entry. |

### Known issues / notes

- **Numeric IDs only.** UUIDs, hash tokens, base64 IDs, and slugs aren't matched by the regex. False negatives surface as "user has to manually add the output" — degraded gracefully to the v1.6.2 flow.
- **No text-source proposals yet.** The DOM snapshot capture needed for "this text appeared at this selector after the last action" isn't in the recording schema. Adding it is a content-script change; v1.7's LLM-fallback patch is the better place to add this since the LLM can reason over the full DOM diff rather than reduce to a single text node.
- **Singularizer is naive.** Works for English regular plurals. `news` / `series` / `data` / non-English path names produce odd names. The user can edit at review time.
- **Patch plan stays.** v1.7.4 composer auto-wire (the third big UX win — Queue composer reads outputs from earlier steps and auto-wires matching-name inputs in later steps) is next.

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
