# v1.6

## v1.6.2 — Save UI Inputs and Outputs Panels (2026-05-28)

### Problem

v1.6.1 landed the schema additions (`WorkflowRecording.inputs`, `WorkflowRecording.outputs`, `QueueStep.inputValues`) but no UI to author them. A recording saved today still serializes with `inputs: []` and `outputs: []` — the contract is in place, but the popup gives the user no way to declare parametric inputs or outputs. Next milestone in the v1.6 patch plan: the Save panel grows the authoring surface so a user can promote recorded fill values to named parameters and declare named outputs (URL regex or text selector) right before clicking Save.

### Solution

Two pieces — a pure helper module with full unit-test coverage, and a React panel that delegates all testable logic to it.

**Pure helpers — `packages/chrome-extension/src/popup/io-authoring.ts`.** Three exports, all framework-free:

- `extractFillEventRows(recording)` walks `recording.events[]` and surfaces one row per `input` or `change` event — those are the only event kinds carrying a recorded `value` worth parameterizing. Returns `{ eventIndex, kind, value, selectorPreview, sensitive }[]` with the selector truncated to 40 chars for popup display. Password-masked rows keep `sensitive: true` so the UI can warn the user before promoting a credential to a per-runner input.
- `validateIOAuthoring({ inputs, outputs })` returns `IOValidationError[]` (empty = ready to save). Rules: every input/output name is a non-empty JS identifier (matches `/^[A-Za-z_$][A-Za-z0-9_$]*$/`); names are unique within each list; input names and output names live in separate namespaces (so the helper's `(ctx, inputs) => outputs` shape lets the same identifier appear on both sides — e.g. `leadName` in / `leadName` out); URL outputs need a non-empty pattern; text outputs need a non-empty selector. Each error carries `{ scope, index, field, message }` so the UI can attach the message to the offending row without re-deriving which row failed.
- `attachIOToRecording(recording, inputs, outputs)` returns a fresh `WorkflowRecording` with the authored arrays attached. The save handler calls this just before serialization; keeps the merge in one tested place. Verified non-mutating.

**React panel — `packages/chrome-extension/src/popup/IOAuthoringPanel.tsx`.** Two collapsible `<details>` sections, embedded by `RecordingSummaryPanel` above the Save button. Both default open when their authored array is non-empty; collapsed when empty so the simple no-I/O Test Case shape stays clean.

The **Inputs section** lists one row per fill-class event from `extractFillEventRows`. Each row shows the event index (e.g. `#7`), kind tag (`input` / `change`), the truncated selector, the recorded value in italic, a 🔒 if the input is password-masked, and a checkbox. Checking the row reveals a name field. The component manages state immutably — checking → adds to `inputs[]`; unchecking → removes by `eventIndex`; editing the name → in-place updates. Validation errors render directly under the offending row.

The **Outputs section** is a list of rows + an `+ add output` button. Each row is a four-column grid: name input, kind dropdown (`from URL` / `from text`), pattern/selector input, and a `×` remove button. Changing the kind swaps the source shape (`{ kind: 'url', pattern: '' }` ↔ `{ kind: 'text', selector: '' }`) and emits the new state up; the placeholder updates from `/leads/(\d+)` to `h1.title` to give the user the right mental model. Validation errors span the full grid width under the row.

**Save-button gating.** `RecordingSummaryPanel` keeps the authored arrays in local `useState` and tracks the latest validation errors via `IOAuthoringPanel`'s `onValidationChange` callback. The Save button is `disabled` when the recording has zero events (the v0.5.4 baseline) *or* when validation errors are present; hovering shows a tooltip naming the error count. The hover-disabled state replaces the silent "click does nothing" that would happen if we let Save fire with invalid I/O — the user sees immediately that something needs fixing.

**Save-handler integration.** `App.tsx`'s `handleSaveRecording` signature widens from `(recording)` to `(rawRecording, inputs, outputs)`. The first line merges the authored arrays into the recording via `attachIOToRecording`; the rest of the handler is unchanged. `recording.json` written to disk now carries the user-declared I/O alongside the events; `recording.spec.ts` and `recording.ts` are still rendered by the v1.5.0 renderers (which ignore `inputs` / `outputs` — that's v1.6.4's job).

**Backward compat.** A recording stopped pre-v1.6.2 carries `inputs: []` / `outputs: []` via the schema defaults. The panel initial state reads `recording.inputs ?? []` / `recording.outputs ?? []`, so re-opening such a recording's review state lands the panels in their empty-but-available form. No migration needed.

**Tests.** 28 new cases in `packages/chrome-extension/tests/io-authoring.test.ts` covering `extractFillEventRows` (filter rules, sensitive flag, selector truncation, empty case), `isValidIOName` (12 parameterized cases), `validateIOAuthoring` (every rule + the input/output namespace-separation property), and `attachIOToRecording` (correct merge + non-mutation). 437/437 tests passing (was 409).

### New

- `packages/chrome-extension/src/popup/io-authoring.ts` — pure helpers for the Save-panel authoring UI.
- `packages/chrome-extension/src/popup/IOAuthoringPanel.tsx` — React panel with the two collapsible sections.
- `packages/chrome-extension/tests/io-authoring.test.ts` — 28 unit tests.

### Changed

- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` — embeds the `IOAuthoringPanel`; `onSave` signature is now `(inputs, outputs) => void`; Save button gates on validation errors.
- `packages/chrome-extension/src/popup/App.tsx` — imports `attachIOToRecording`, widens `handleSaveRecording` signature, threads authored I/O into the recording before serialization.
- `packages/chrome-extension/src/popup/popup.css` — appends `.io-panel` + `.io-section` + `.io-input-row` + `.io-output-row` + `.io-error` + `.io-add-btn` styles matching the existing `.trace-*` review-panel aesthetic.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/io-authoring.ts` | **New** — 3 pure helpers + types. |
| `packages/chrome-extension/src/popup/IOAuthoringPanel.tsx` | **New** — React panel with Inputs + Outputs sections. |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | **Edit** — embeds the panel; widens `onSave` signature; gates Save on validation. |
| `packages/chrome-extension/src/popup/App.tsx` | **Edit** — merges authored I/O via `attachIOToRecording` before write. |
| `packages/chrome-extension/src/popup/popup.css` | **Edit** — new `.io-*` styles (~190 lines appended). |
| `packages/chrome-extension/tests/io-authoring.test.ts` | **New** — 28 tests. |
| `Versions/v1/v1.6/release-notes.md` | This entry. |

### Known issues / notes

- **Manual verification in the popup deferred.** All static checks pass (`pnpm test` 437/437, `make build` clean, `make lint` clean, `pnpm --filter @webspec/chrome-extension build` produces a clean extension bundle). The browser-side experience (the two `<details>` open/closed transitions, checkbox-then-name-field reveal, kind-dropdown source swap, error message attachment to the right row) is straightforward React but hasn't been exercised against a real recording yet. Will be covered when the next manual-test-plan pass runs through v1.6.
- **The authored I/O is captured but not yet rendered.** v1.6.4 wires `WorkflowRecording.inputs[]` into the helper module's parameter substitution and `WorkflowRecording.outputs[]` into the extraction tail. Until then, a Test Case with declared I/O writes the metadata to `recording.json` but the helper module still emits the same recorded-literal-only body it does today. This is the same shape as v1.6.1's "schema-only" note: each patch is independently shippable.
- **No "promote subset of value" UX.** Per the design doc, v1.6 substitution is whole-value-only. A recording fill of `"Acme Corp Inc"` becomes `inputs.leadName` wholesale; there's no way to parameterize just `"Acme"` from within that string. The Save panel reflects that: the value column is read-only display, not editable.

## v1.6.1 — Test Case and Queue Step Schemas (2026-05-28)

### Problem

v1.6.0 locked the design for input/output wiring but landed no code. The build plan calls for schema changes first (contract → write surface → read surface → render → integration) so each follow-up patch can be implemented and shipped independently. Until the `WorkflowRecording` and `QueueStep` schemas grow the new optional fields, no UI or renderer work can begin — there's nothing to read from or write to.

### Solution

Two additive, optional, backward-compatible schema extensions plus tests.

**`WorkflowRecording` (the on-disk Test Case shape) gains `inputs?` and `outputs?`.** Defined in `packages/core/src/types/analysis.ts`:

```ts
RecordingInputSchema  = { name: string; eventIndex: number }
RecordingOutputSchema = { name: string; source: RecordingOutputSource }
RecordingOutputSourceSchema = discriminatedUnion<'kind',
  | { kind: 'url';  pattern: string  }   // RegExp string with a capture group
  | { kind: 'text'; selector: string }   // CSS selector for textContent()
>
```

Both arrays default to `[]` so a v1.5.x `recording.json` without these fields parses cleanly and surfaces as empty arrays — the no-I/O-declared shape every existing recording has today. The two source kinds match the design doc's MVP scope (URL regex + text selector); attribute / response-body / localStorage extraction stays deferred.

**Naming note.** The new types are `RecordingInput` / `RecordingOutput` / `RecordingOutputSource`, not `TestCaseInput` / `TestCaseOutput` as the design doc draft sketched. `TestCase` is already taken in `analysis.ts` (it's the M2 TestPlan unit-test case — different concept, deferred path). `Recording*` better matches the schema's home (`WorkflowRecordingSchema`) and avoids a collision that would have looked deliberate but isn't.

**Schema permissiveness on `eventIndex`.** The schema only validates `eventIndex` is a non-negative integer — it does *not* enforce that the indexed event is value-bearing (`input` / `change`). That check belongs to the Save UI (which only surfaces fill-class events in the "promote to input" picker, per the design doc) and keeping the schema permissive lets older recordings round-trip if the event-kind set ever broadens.

**`QueueStep` gains `inputValues?`.** Defined in `packages/core/src/library/queue.ts`:

```ts
QueueStepInputValueSchema = discriminatedUnion<'mode',
  | { mode: 'constant'; value: string }
  | { mode: 'output';   step: number; outputName: string }   // 1-based step index
>

QueueStepSchema gains:
  inputValues?: Record<string, QueueStepInputValue>          // keys = input names
```

Optional record from input name to value source. Absent or `{}` means the step's Test Case declares no inputs (or the user hasn't wired them yet — a composer-side validation concern, not a schema one). The schema enforces local shape: `step` is a positive integer, `outputName` is non-empty. The composer enforces cross-step rules (target step must exist, must be earlier, must have `iterations === 1`, must declare the named output) — per the design doc's split of responsibilities.

**Public re-exports.** `RecordingInputSchema`, `RecordingOutputSchema`, `RecordingOutputSourceSchema`, and their inferred types flow through `packages/core/src/index.ts` + `browser.ts` automatically via the existing `export * from './types/analysis.js'`. The new `QueueStepInputValueSchema` + `QueueStepInputValue` type are added to both entry points' explicit re-export blocks so chrome-extension and CLI callers can import them at the same path as the existing `QueueStep` symbols.

**Tests.** New `packages/core/tests/types/workflow-recording-io.test.ts` (16 cases) covers the four new schemas plus the most important property — a recording missing `inputs` / `outputs` parses cleanly and defaults to empty arrays (the v1.5.x backward-compat invariant). Extended `packages/core/tests/library/queue.test.ts` (+9 cases) covers the new step-level wiring shape and the `QueueStepInputValueSchema` discriminated union. 409/409 tests passing (+25 from v1.5.3's 384).

### New

- `packages/core/src/types/analysis.ts` — `RecordingInputSchema`, `RecordingOutputSchema`, `RecordingOutputSourceSchema` + inferred types; `inputs` and `outputs` fields on `WorkflowRecordingSchema` (both default `[]`).
- `packages/core/src/library/queue.ts` — `QueueStepInputValueSchema` + inferred type; `inputValues?` field on `QueueStepSchema`.
- `packages/core/tests/types/workflow-recording-io.test.ts` — 16 schema tests for the new types.

### Changed

- `packages/core/tests/library/queue.test.ts` — 9 new cases covering `inputValues` on steps and the `QueueStepInputValueSchema` discriminated union (constant / output references, step-indexing rules).
- `packages/core/src/index.ts` + `packages/core/src/browser.ts` — re-export `QueueStepInputValueSchema` and the `QueueStepInputValue` type alongside the existing queue exports.

### Fixed

- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx:115` — drive-by: `let trimmed` → `const trimmed` in `compactUrl`. Pre-existing lint failure latent since v1.2.0; surfaced when `make lint` ran clean against the rest of the v1.6.1 changes. One-character fix; mentioned here for honesty, not because it relates to I/O wiring.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | **Add** `RecordingInputSchema`, `RecordingOutputSchema`, `RecordingOutputSourceSchema` + types; **extend** `WorkflowRecordingSchema` with `inputs` + `outputs` (default `[]`). |
| `packages/core/src/library/queue.ts` | **Add** `QueueStepInputValueSchema` + type; **extend** `QueueStepSchema` with optional `inputValues`. |
| `packages/core/src/index.ts` | Re-export `QueueStepInputValueSchema` + `QueueStepInputValue` type. |
| `packages/core/src/browser.ts` | Re-export `QueueStepInputValueSchema` + `QueueStepInputValue` type. |
| `packages/core/tests/types/workflow-recording-io.test.ts` | **New** — 16 cases. |
| `packages/core/tests/library/queue.test.ts` | **Edit** — +9 cases for step-level wiring. |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | **Fix** — `let trimmed` → `const trimmed` (drive-by lint fix; pre-existing since v1.2.0). |
| `Versions/v1/v1.6/release-notes.md` | This entry. |

### Known issues / notes

- **Schema-only patch — no behavior change yet.** The Save UI (v1.6.2) still ignores the new fields, and the renderers (v1.6.4) don't read `inputValues`. A recording saved today still has `inputs: []` / `outputs: []`; a queue still renders identically to v1.5.x. The contract is in place for the next patches to build on.
- **`Recording*` naming differs from the design doc.** `docs/10` § "v1.6 — Input/Output Wiring (design locked)" sketches `TestCaseInput` / `TestCaseOutput`. The actual exports are `RecordingInput` / `RecordingOutput` / `RecordingOutputSource` to avoid a collision with the M2 `TestCase` type already in `analysis.ts`. Will update the design doc reference inline in v1.6.2 (when the Save UI lands and the names are user-facing in the popup code).
- **Composer-side validation lives in v1.6.3.** The schema permits invalid cross-step references (e.g. wiring `inputValues` to a future step number) — that's by design. The composer is where the cross-step + target-step + iterations rules get enforced.

## v1.6.0 — Input Output Wiring Design (2026-05-28)

### Problem

Item #3 in the post-v1 stack — Input/output wiring — was a one-line stub in `docs/10-team-shareability.md` § "v1.5+ futures":

> Test Cases declare their outputs (`createLead → { leadId }`) and inputs. The Queue composer wires them. Enables Queue 3-style "start at step 5 with a record passed from step 4."

Enough to know what shipping it means, not enough to build from. Open shape questions: how do Test Cases declare outputs (recorded vs. user-declared vs. LLM-proposed)? How do they accept inputs (parametric vs. step-level overrides)? How does a Queue step reference an earlier step's output (alias vs. step number vs. user-named)? How do iterations interact with output wiring? Per the project's "design before code" working norm, these had to be locked before the schema, UI, and renderer changes could begin.

### Solution

Aligned the four foundational shape decisions in conversation, then wrote them into `docs/10-team-shareability.md` as a new "v1.6 — Input/Output Wiring (design locked, 2026-05-28)" section that mirrors the v1.5.0 / v1.5.1 design-locked sections immediately above it.

**Decisions locked (one option chosen for each):**

1. **Outputs — user declares at Save.** Two source kinds in v1.6 MVP: a URL regex with a capture group (`/\/leads\/(\d+)/` → `match[1]`) and the text content of a CSS selector (`page.locator(sel).first().textContent()`). The user names each output and picks its source kind from a dropdown in the Save panel. No inference, no LLM proposals — explicit, the user owns the contract.

2. **Inputs — parametric Test Cases.** At Save, the popup surfaces the recording's fill/input events with their literal values; the user checks any value they want to promote and names it. Helper signature becomes `createLead({ page, context }, { leadName }) → { leadId, leadName }`. Whole-value substitution only (no substring parameterization in v1.6).

3. **Step references — auto-aliased `<slug>_<index>`.** A Queue with `[createLead, updateLead]` renders as `const createLead_1 = await createLead(...)` and `const updateLead_2 = await updateLead(...)`. Stable, readable, no extra user typing. Aliases are positional; reorder is handled by re-rendering on Save.

4. **Iterations × I/O — iterated steps can't supply outputs.** A step with `iterations > 1` is hidden from the output-source dropdown for later steps. Iterations stay a "do this N times" smoke pattern. Iterated steps can still *consume* inputs (same value each pass; per-iteration variation is the next milestone's job).

**Design doc covers:**

- The mental model — a Test Case as a function with named inputs and outputs.
- `TestCase` schema additions (`inputs?: TestCaseInput[]`, `outputs?: TestCaseOutput[]`) with both fields optional for backward compatibility with v1.5.x recordings.
- `QueueStep` schema addition (`inputValues?: Record<string, { mode: 'constant' | 'output', ... }>`).
- Save UI shape — two collapsible panels under the existing name/description/runAs fields.
- Composer UI shape — per-step Inputs subsection with a wiring dropdown (constant | from step N).
- Helper signature & rendered output, including the "scan-forward to decide whether to assign the return value" rule that keeps non-wired call sites clean.
- Standalone `recording.spec.ts` wrapper behavior — inputs default to the **recorded literals** (not empty strings) so standalone replay still reproduces the recording faithfully.
- Renderer changes — three pieces touch (`renderTestCaseModule`, `renderQueueSpec`, the standalone wrapper).
- Iteration semantics — the formal rules implied by decision #4.
- Backward compatibility & self-heal — v1.5.x Test Cases keep working; pre-v1.6 Queues re-render unchanged unless their referenced Test Cases gain declared inputs.
- Out of scope for v1.6 — per-iteration input variation, substring substitution, attribute / response-body extraction, iterated-step outputs as arrays, proactive cross-reference validation.
- Patch plan inside v1.6 — design (this patch) → schema → save UI → composer UI → renderer → integration tests.

Also updated the v1.5+ futures list's item #3 entry to `✅ Design locked above — implementation begins in v1.6.1`, matching the convention used for items #1 and #2 above it.

### New

- `docs/10-team-shareability.md` — new "v1.6 — Input/Output Wiring (design locked, 2026-05-28)" section with full design.

### Changed

- `docs/10-team-shareability.md` § "v1.5+ futures" — item #3 marked design-locked with a pointer to the new section.

### Fixed

- N/A — doc-only patch.

### Files Changed

| File | Change |
|------|--------|
| `docs/10-team-shareability.md` | **New section** — v1.6 Input/Output Wiring design (~190 lines). **Edit** — marked item #3 in v1.5+ futures as design-locked. |
| `Versions/v1/v1.6/release-notes.md` | This entry (v1.6 minor file created by `new-version.sh --minor`). |

### Known issues / notes

- No code changes in this patch — the contract is the spec. v1.6.1 begins implementation with the `TestCase` + `QueueStep` schema additions (zod + storage), no UI yet.
- The standalone-spec default-input behavior (recorded literals vs. empty strings) was flagged as "open implementation detail" mid-draft and resolved inline to **recorded literals** before locking. Captured here so future patches don't reopen it.
- Cross-reference validation when a Test Case removes a previously-declared input/output is intentionally deferred to v1.7+ — the next Queue Save will surface the issue, or `npm test` will fail with a TypeScript error. Either is loud enough for the MVP.
