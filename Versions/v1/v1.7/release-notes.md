# v1.7

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
