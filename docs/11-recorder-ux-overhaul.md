# 11 — Recorder UX overhaul (v1.7 design)

> **Status:** stub. Design in progress 2026-05-28. Locked decisions land in this doc as they're made; this file is the spine of v1.7 the same way `docs/10` is the spine of v1.4–v1.6.

## Why this exists

v1.6 shipped working code for parametric Test Cases and wired Queues — the static + integration coverage is all green. But the in-browser manual verification surfaced a real product issue: **the v1.6.2 promote-picker and v1.6.3 wiring dropdown shift work onto the human that webspec's mission says the tool should do.** Rob's exact phrase on 2026-05-28: *"this is nonsense work that makes this tool unusable by a human."*

Three-pillar webspec mission (see project memory `webspec-mission`):

1. **508 / WCAG audit** of the live page.
2. **Stackable tests** — record reusable units, compose them into stacks.
3. **Render Playwright** for the test cases and stacks.

The human's job is *record* and *review*. v1.6 added a `compose-and-author-every-detail` step between those — a violation of the contract. v1.7 closes that gap.

## What v1.7 changes

Four pieces, mutually reinforcing:

### 1. Side panel = single surface

Replace the click-to-open extension popup with Chrome's native side panel (Chrome 114+ Side Panel API).

- Stays attached to the browser; persistent while the user interacts with the page.
- No popup-closes-when-you-click-away.
- Hosts every current view: Audit, Record, Save, Settings, Queues.
- One React app, one entry point — replaces the current `popup/` + `settings/` split.

**Open questions:** How does the side panel relate to the existing `report/` view? Does Audit-this-tab open in the side panel now, or stay as a separate full-tab view? Probably side panel, but TBD.

### 2. Floating overlay during record

While recording, inject a page-level overlay (content script) with:

- Live event feed — each recorded event appears as a line: `▸ click "Add Lead"`, `▸ fill #name "Acme"`, `▸ navigate /lead/1`.
- A **Stop** button right on the overlay. No more "click extension icon → click Stop."
- Dismissable / minimizable so it doesn't block page interaction.

The recorder already runs in the content script; rendering an event-by-event feed is just emitting to the overlay as each event is captured.

**Open questions:** Where on the page does it anchor by default? Top-right? User-draggable? Should it disappear when the user clicks Stop (and we transition to the Save panel in the side panel)?

### 3. Auto-proposed I/O at record-stop

When the user stops recording, the tool examines:

- The recording's event sequence (fill values, click targets).
- The final page state captured at stop time (URL, DOM near the last action, visible text changes).
- Optional: pass the whole thing through `BedrockAdapter` for harder cases — same seam M6 uses for negative-scenario amplification.

…and **proposes** the I/O contract:

- **Inputs**: fills with values worth parameterizing (skip empty/sensitive/system-typed text). Suggested names from the field's label / placeholder / name attribute.
- **Outputs**: URL changes (extract the new path segment via regex), newly-visible text near the last action point (extract via selector).

The Save panel becomes a **review surface**, not an authoring surface. User edits a name, rejects a proposal, or accepts as-is.

**Open questions:**
- Heuristic-only or always LLM-routed? Per memory `feedback_llm_cost_vs_flexibility`, banking LLM features for a future Pro tier matters; heuristic-first with LLM as fallback may be the right shape.
- What's the schema change? The current `WorkflowRecording.inputs` / `.outputs` (v1.6.1) probably stays — they're the contract artifact; what changes is *who populates them*. Adapter writes them at stop time; the user-facing UI just lets the user edit.

### 4. Composer auto-wires

When a Queue step references a Test Case with declared inputs, the composer scans earlier steps' declared outputs and auto-wires by name match:

- Step 1 outputs `leadId`, `leadName`.
- Step 2 declares input `leadName`.
- Composer wires step 2's `leadName` → `step1.leadName` automatically. No dropdown click.

The current per-step Inputs subsection (v1.6.3) only surfaces when there's a real choice to make:

- Multiple earlier steps declare the same output name → ambiguity, user picks.
- No earlier step has a matching-name output → user supplies a constant or marks unresolved.
- Otherwise: silent, auto-wired, no UI.

**Open questions:**
- Strict name match or fuzzy (Levenshtein, plural/singular)? Lean strict for v1.7 MVP; relax if needed.
- Same-name on different types (input vs output) — handled in v1.6's namespace separation; preserve.

## Patch plan (placeholder — refined as design locks)

- **v1.7.0** — this design doc (the stub you're reading; iterates in conversation until locked).
- **v1.7.1** — side panel scaffold (Chrome side panel manifest + one-view migration; existing popup behavior preserved during transition).
- **v1.7.2** — Audit + Save view migration into side panel.
- **v1.7.3** — Settings + Queues view migration; popup retired.
- **v1.7.4** — Floating recorder overlay with live event feed + Stop button.
- **v1.7.5** — Auto-proposed I/O at record-stop (heuristic-first); v1.6.2 promote-picker removed.
- **v1.7.6** — Composer auto-wire; v1.6.3 manual wiring dropdown becomes the unresolved-only escape hatch.
- **v1.7.7** — LLM-fallback for I/O proposals (Bedrock seam).
- **v1.7.x** — integration tests + manual test plan update.

Patch plan will be revised once the design is locked through conversation.

## Out of scope for v1.7 (preserved for later)

- **Per-iteration input variation.** Same constraint as v1.6 (iterated step receives same inputs each pass).
- **Substring substitution.** Whole-value-only substitution preserved.
- **Backend / DB-driven assertions.** Recording + DOM state only.
- **Auth profile authoring rework.** v1.3 design stays.
- **AI variation amplification** (was v1.5+ futures item #3). Still the next milestone after v1.7 ships.

## Position relative to other docs

- **`docs/10-team-shareability.md`** § "v1.6 — Input/Output Wiring" — superseded for the *authoring UX*. The schema (RecordingInput / RecordingOutput / QueueStepInputValue) stays; what changes is who populates the fields and how.
- **`docs/07-build-plan.md`** — v1.7 entry to be added once the design is locked. v1.5+ futures item #3 (AI variation amplification) stays the next-after.
- **`docs/99-open-questions.md`** — heuristic-vs-LLM-by-default question to be filed here once the design discussion has clarified it.

## Status

**Stub** (2026-05-28). Awaits the design conversation that locks each piece. Tracking issue: #62.
