# v0.3.2 — Pivot To Shift Left (2026-05-08)

## Problem

The original v1 scope had three coequal capabilities — unit-test gen from Angular source files, a11y audit, and recording → Playwright — exposed across three coequal surfaces (CLI, VS Code, Chrome extension). After working on it, the underlying mission clarified: **shift left and fail faster on web app development.** A developer walks through their feature in Chrome, the tool catches problems before formal testing.

That mission doesn't fit the original scope cleanly:

- **Unit-test gen from `.component.ts` source** is productivity tooling, not a shift-left signal. A dev typing `webspec gen foo.component.ts` to get a Jest spec is convenient, but it doesn't catch issues earlier than they otherwise would. It's also the only framework-tied piece in the whole tool — Angular-specific by necessity, since unit tests of a component need its API.
- **VS Code as a coequal surface** adds friction without adding shift-left value when the dev is already in Chrome driving their app.
- **"Record → Playwright spec"** as currently planned is a 1:1 translation with optional LLM polish (test names + assertions). What actually serves shift-left is **LLM amplification** — the recorder captures the happy path; the LLM proposes negative scenarios (empty input, invalid input, error states, edge variants) the dev didn't think to try.

These weren't broken decisions, but they spread effort across surfaces and capabilities that don't all earn their seat in v1.

## Solution

Doc-only pivot. Reshape v1 around the shift-left mission:

- **v1 active path is now M4 + M5 + M6**, all browser-first, all framework-agnostic.
  - M4 — A11y analyzer + report renderer (Chrome ext + thin CLI).
  - M5 — Chrome extension (the v1 primary surface): audit + workflow recorder.
  - M6 — Recording → Playwright `.spec.ts` with **positive AND negative scenarios** (LLM-amplified). The spec contains the recorded happy path plus LLM-generated negative variants in additional `test()` blocks.
- **v1 ships a thin CLI** for CI integration (`webspec audit`, `webspec record-to-spec`) — not a unified CLI surface.
- **M2 stays as foundation** (the Angular `TestPlan` analyzer + Jest renderer shipped in v0.3.0). TestPlan stays unit-test-shaped; M6 introduces a separate e2e-shaped intermediate.
- **M6 IR resolved (Path C):** LLM emits a typed structured `AmplifiedRecording` (`scenarios[]` with typed actions + assertions); a deterministic renderer formats it into Playwright source. Same architectural pattern as M2 — LLM never writes shipped code directly. Beats both "reuse TestPlan" (category mismatch) and "LLM emits Playwright source" (loses validation gate).
- **Post-v1 unit-test-gen reactivation:** the path returns as a save-time editor watcher (which IS shift-left), not a manual CLI. M2 foundation stays in the codebase ready to pick up.
- **Secondary success metric** added to `mission.md`: save time, stop defects from reaching the test phase. Sharper framing of shift-left + fail-fast.
- **Deferred from v1 active path:**
  - M3 (CLI for unit-test gen). The `webspec gen` and `webspec init` commands go away in v1; reactivate post-v1 if there's demand.
  - M7 (VS Code extension). Browser-first means browser-only in v1.
  - M8 (second LLM adapter + parity test). The seam is proven structurally; second adapter is post-v1 unless customer procurement forces it sooner.

No code changes. M0–M2 deliverables (foundations, contract artifact, LLM seam, TestPlan analyzer + Jest renderer) all stay in the codebase exactly as shipped. The pivot is purely about what we *extend* next.

## New

- New v1 Definition of Done in `docs/07-build-plan.md` reflecting the shift-left mission.
- New open questions in `docs/99-open-questions.md`:
  - Does M6 amplification route through `TestPlan` or render Playwright directly from `WorkflowRecording`?
  - Does unit-test-from-source return post-v1 as a save-time watcher?
  - Confirmed: v1 CLI surface area is smaller than originally scoped.

## Changed

- `docs/mission.md` — full rewrite. Mission leads with shift-left + fail-fast. Tool reframed as a browser-based dev-time companion. Three v1 things: workflow recorder, recording → Playwright with positive/negative scenarios, 508/WCAG audit. Drops "Cut the time Bellese teams spend writing Angular unit-test boilerplate" framing.
- `docs/07-build-plan.md` — v1 DoD rewritten. M2 marked as foundation/deferred. M3 marked as deferred from v1. M6 reshaped to make the LLM-amplification pass produce positive + negative scenarios as multiple `test()` blocks. M7 + M8 deferred from v1.
- `docs/00-overview.md` — "What this tool does" + "v1 scope" sections rewritten. Three capabilities now framed as "all on a live page" with shift-left as the binding mission. Diagram updated to reflect Chrome-as-primary + thin CLI.
- `docs/01-architecture.md` — surfaces section reordered: Chrome ext now listed first as v1 primary; CLI v1 surface area noted as reduced; VS Code marked as deferred.
- `docs/02-contract-spec.md` — TestPlan variant section gains a note that the IR is reusable for M6 amplification (positive + negative scenarios as `cases[]`); `framework` widening (`'jest'` → `'jest' | 'playwright'`) flagged as a Bucket A (additive) change.
- `CLAUDE.md` — top-line description rewritten to lead with the browser-based shift-left framing. "Current state" section updated to reflect M0–M2 shipped + the pivot.

## Fixed

- v1 scope no longer over-promises a unified CLI + VS Code + Chrome surface area when the mission only requires the Chrome surface to ship.
- `mission.md` no longer leads with "writing Angular unit-test boilerplate" — that framing predated the shift-left clarification.

## Files Changed

| File | Change |
|------|--------|
| `CLAUDE.md` | Top-line + "Current state" rewritten for the pivot. |
| `docs/mission.md` | Full rewrite — shift-left + fail-fast, browser-first, three v1 capabilities. |
| `docs/00-overview.md` | "What this tool does" + "v1 scope" + diagram + "Reading order" + "North-star" updated. |
| `docs/01-architecture.md` | Surfaces section reordered + scope notes. |
| `docs/02-contract-spec.md` | TestPlan variant — note on M6 reuse. |
| `docs/07-build-plan.md` | v1 DoD + M2/M3/M6/M7/M8 statuses reshaped for the pivot. |
| `docs/99-open-questions.md` | 3 new entries: M6 IR path, unit-test-gen reactivation post-v1, CLI surface area. |
| `Versions/v0/v0.3.2/release-notes.md` | This file. |

## Verification

No code changed. Existing tests still pass (no need to re-run; nothing in `packages/` was touched).

`make ci` will be re-run by Rob before merge as a sanity check.
