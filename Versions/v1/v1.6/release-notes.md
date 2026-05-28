# v1.6

## v1.6.4 — Renderer Inputs and Outputs (2026-05-28)

### Problem

After v1.6.1–v1.6.3, a Test Case's `recording.json` can carry `inputs`/`outputs` and a Queue's `step.inputValues` can wire them — but no renderer reads any of it. A Test Case helper module still emits `async function run({ page, context })` with literal recorded values inline. A Queue spec still calls `await createLead({ page, context })` with no second argument. The schema and authoring surfaces are all in place; the rendered output has none of it. This is the patch that turns the wiring into executable Playwright code.

### Solution

Three renderer changes — one shared helper extension, one Test Case module rewrite, one Queue spec extension.

**`renderEvent` accepts an optional `valueOverride`.** `packages/core/src/render/e2e/renderer.ts`. The function signature widens to `renderEvent(event, valueOverride?)`. When `valueOverride` is set:
- `input` (fill) emits `.fill(<override>)` — the override goes in unquoted as a TypeScript expression (e.g. `inputs.leadName`).
- `change` with `options !== undefined` (a `<select>`) emits `.selectOption(<override>)` — same treatment.
- `change` without `options` (checkbox / radio) ignores the override; the recorded verb (`check` / `uncheck`) wins. Parameterizing the verb at runtime would need a ternary in the rendered source, which v1.6 MVP intentionally skips per docs/10 § "Out of scope for v1.6". Listed as a known limitation below.

When `valueOverride` is `undefined`, the function behaves exactly as before — all 31 existing e2e renderer tests still pass without modification.

**`renderTestCaseModule` emits typed inputs + outputs.** `packages/core/src/render/test-case/renderer.ts`. The helper:

1. Builds a `subsByIndex: Map<number, string>` from `recording.inputs[]` → for each declared input, maps the promoted `eventIndex` to the TS expression `inputs.<name>`.
2. Builds `inputDefaults: Map<name, string>` from the corresponding events' recorded values — these become the parameter's recorded-literal defaults, preserving the standalone-spec replay fidelity decision in the design doc.
3. Emits one of three signature shapes depending on whether inputs / outputs were declared:
   - No I/O: `async function run({ page, context }): Promise<void>` (unchanged from v1.5.0 — backward-compatible).
   - Inputs only: `async function run({ page, context }, inputs: { leadName: string } = { leadName: 'Acme Corp' }): Promise<void>` — multi-line with recorded-literal defaults.
   - Inputs + outputs: `Promise<{ leadId: string; leadName: string }>` return type narrows to declared outputs.
4. Walks `recording.events.forEach((event, eventIndex))` and passes `subsByIndex.get(eventIndex)` to `renderEvent`. Events not in `subsByIndex` emit their recorded literal as before.
5. **Extraction tail** — runs after the last recorded action when `recording.outputs[]` is non-empty:
   - `kind: 'url'` → `const _out_<name> = page.url().match(/<pattern>/)?.[1] ?? '';`
   - `kind: 'text'` → `const _out_<name> = ((await page.locator('<selector>').first().textContent()) ?? '').trim();`
   - Followed by `return { <name>: _out_<name>, ... };`

The `regexLiteral` helper renders the user's pattern into a valid JS regex literal, escaping unescaped forward slashes (so `/leads/(\d+)/` doesn't terminate the literal at the first `/`). Newlines are stripped defensively.

**`renderQueueSpec` wires inputs + captures returns.** `packages/core/src/render/queue/renderer.ts`. Two new pieces:

- **`computeStepReferencedFlags(steps)`** forward-scans every step's `inputValues` for `mode: 'output'` references and returns a `boolean[]` flagging which steps' return values need to be captured. Used to decide whether to render `const createLead_1 = await ...` vs the bare `await ...` form. Per the design doc, we don't add unused `const` assignments — only captured when something downstream actually reads them. Belt-and-suspenders: iterated steps are never flagged as referenced (the composer + schema already rule this out, but the call-site checks `iterations === 1` again before capturing).
- **`renderInputsArg(inputValues, stepLocals)`** builds the second argument to the helper call: `{ leadName: 'Acme', email: createLead_1.email }`. Constants get quoted via the shared `quote` helper; output references emit as `<local>.<outputName>` reads against the captured earlier-step return value. Returns `null` when `inputValues` is empty/undefined so the call stays in the bare `helper({ page, context })` form.

The `stepLocals` array is built upfront — one entry per step, format `<slug-identifier>_<1-based-index>` (e.g. `createLead_1`, `fillDetails_2`). Aliases are positional; reorder is a re-render. Iterated steps still get the for-loop wrap; the helper call inside the loop receives the same `inputsArg` each iteration (per-iteration variation is the next milestone).

**Hand-edited safety net.** If a hand-edited Queue manifest carries an out-of-range `value.step` reference, `renderInputsArg` emits `__missing_step_N` rather than crashing the renderer. The result is a TypeScript compile error at `npm test` time pointing at the bad identifier — loud failure rather than silent.

**Tests.** 7 new cases in `packages/core/tests/render/test-case/renderer.test.ts` (typed inputs param with recorded defaults, substitution at promoted events, non-promoted events stay literal, url extraction shape, text extraction shape, both inputs+outputs together, no-I/O backward-compat). 6 new cases in `packages/core/tests/render/queue/renderer.test.ts` (constant wiring, output reference + return capture, no capture when unreferenced, iterated step with inputs, iterated step never captures, multi-input stable key order). 467/467 tests passing (was 454).

Existing inline snapshots for the no-I/O Test Case module still match — the backward-compat path is unchanged. The v1.5 integration tests (which build real on-disk projects and run `npx playwright test`) all still pass against the no-I/O fixtures, confirming the renderer changes haven't regressed the v1.5.0 shape.

### New

- `renderEvent(event, valueOverride?)` — optional second parameter for input substitution in `packages/core/src/render/e2e/renderer.ts`.
- `renderTestCaseModule` extraction tail + typed inputs/outputs in `packages/core/src/render/test-case/renderer.ts` (helpers `renderInputsTypeAnnotation`, `renderInputsDefaultExpr`, `renderReturnTypeAnnotation`, `regexLiteral`, `pageLocator`).
- `computeStepReferencedFlags` + `renderInputsArg` in `packages/core/src/render/queue/renderer.ts`.
- 13 new renderer test cases (7 for test-case, 6 for queue).

### Changed

- `packages/core/src/render/e2e/renderer.ts` — `renderEvent` widens signature; `renderChange` accepts and forwards `valueOverride` for selects.
- `packages/core/src/render/test-case/renderer.ts` — three signature shapes depending on declared I/O; substitution at promoted events; output extraction tail.
- `packages/core/src/render/queue/renderer.ts` — per-step local-variable naming; capture-on-reference forward scan; inputs argument rendering.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/e2e/renderer.ts` | **Edit** — `renderEvent` accepts optional `valueOverride`; `renderChange` forwards it for selects, ignores it for checkboxes. |
| `packages/core/src/render/test-case/renderer.ts` | **Rewrite** — typed inputs param with recorded-literal defaults; declared-output return type; extraction tail with url + text source rendering. |
| `packages/core/src/render/queue/renderer.ts` | **Edit** — `stepLocals[]`, `computeStepReferencedFlags`, `renderInputsArg`; helper call renders capture + inputs arg per step. |
| `packages/core/tests/render/test-case/renderer.test.ts` | **Edit** — +7 cases under new "v1.6.4 inputs/outputs" describe block. |
| `packages/core/tests/render/queue/renderer.test.ts` | **Edit** — +6 cases under new "v1.6.4 inputValues" describe block. |
| `Versions/v1/v1.6/release-notes.md` | This entry. |

### Known issues / notes

- **Checkbox/radio inputs ignore substitution.** The Save UI (v1.6.2) surfaces all `input` and `change` events for promotion. If a user promotes a checkbox `change` event, the helper signature gains a declared parameter but the body still emits the recorded `.check()` / `.uncheck()` verb — the override is silently ignored. The parameter becomes effectively unused. Listed as a v1.6 design out-of-scope ("parameterizing the verb at runtime would need a ternary in the rendered source"); a future patch can either filter checkbox events from the Save UI's promote picker or render the ternary if a use case actually surfaces.
- **Schema permits hand-editing past composer-side validation.** A `recording.json` with `inputs: [{ name: 'leadName', eventIndex: 999 }]` (no matching event) renders the helper with `inputs.leadName` declared but never referenced in the body, and the default value defaults to `''`. Same for an out-of-range `value.step` in `inputValues` — the renderer emits `__missing_step_N` to fail loudly at compile rather than crash. Composer-side validation prevents both cases for normal use; hand-edits are the user's problem.
- **Integration tests still run only against no-I/O fixtures.** The v1.5 integration tests in `packages/cli/tests/integration/render-v1-5-helpers.integration.test.ts` (which build real on-disk projects and run `npx playwright test`) all still pass, confirming no regression in the v1.5.0 shape. End-to-end coverage for the v1.6 wiring (parametric helper + wired Queue + output round-trip against the page fixture) is v1.6.5's job per the patch plan.

## v1.6.3 — Queue Composer Inputs Wiring (2026-05-28)

### Problem

v1.6.2 lets the user declare parametric inputs and outputs on a Test Case at Save time, and v1.6.1 added the `QueueStep.inputValues` schema field. But the Queue composer in Settings → Queues has no UI to *populate* `inputValues` — every Queue saved post-v1.6.1 still ships steps without wiring, which means any Test Case with declared inputs will run with its default empty-string parameter values (or fail validation at the renderer in v1.6.4 once that lands). Next patch in the plan: the composer grows a per-step Inputs subsection so the user can wire each declared input to a constant or to an earlier step's output, with cross-step rules enforced at Save.

### Solution

Three pieces — extending the on-disk Test Case summary to carry I/O metadata, a pure helper module for the wiring logic, and the per-step UI block in the existing `QueueEditor`.

**`TestCaseSummary` carries declared I/O.** `packages/chrome-extension/src/shared/queues.ts` widens the summary returned by `listTestCases` from `{ slug, name, runAs }` to `{ slug, name, runAs, inputs, outputs }`. The reader pulls `recording.json`'s `inputs` and `outputs` if present, defaults to `[]` otherwise (covering both pre-v1.6 recordings and v1.6 recordings where the user didn't declare any). The composer dropdown now has everything it needs to render an Inputs subsection per step and a "from step N → outputName" picker.

**Pure helpers — `packages/chrome-extension/src/settings/queue-input-wiring.ts`.** Three exports:

- `availableOutputSources(steps, currentStepIndex)` returns the earlier non-iterated steps' declared outputs in render order, as `{ step, testCaseSlug, outputName }[]`. Iterated earlier steps are hidden per the locked design decision (and a smoke test in the suite locks that behavior). The current step and any later step are excluded — references only flow forward.
- `validateStepWiring(steps, currentStepIndex, wiring)` returns `WiringValidationError[]` covering every cross-step rule: every declared input is wired (no missing keys), `output`-mode references target an earlier non-iterated step, and the target step's Test Case declares the named output. Accumulates errors — doesn't short-circuit on the first one — so the user sees the full picture if they have multiple inputs in trouble.
- `buildInputValuesForStep(declaredInputs, wiring)` returns the `Record<string, QueueStepInputValue>` for serialization, dropping stale keys (the user swapped Test Cases and the old wiring no longer matches any current input). Returns `undefined` when the result is empty so the manifest doesn't carry `inputValues: {}` — keeps `recording-N-slug.json` tidy.

**`StepInputsSubsection` component in `QueuesPanel.tsx`.** Rendered inline under each step row when the step's Test Case has declared inputs. One row per declared input: a name label (code-styled), a mode dropdown (`constant` / `from earlier step` — the latter disabled when no earlier non-iterated step has declared outputs), and either a text field (constant) or a step-and-output picker (`step N (slug) → outputName`).

The Test Case dropdown's `pickTestCase` handler resets `inputValues` to `{}` whenever the user swaps Test Cases — stale wiring would otherwise survive and render against the new Test Case's inputs with the old picks intact. The mode-swap (`constant` ↔ `output`) initializes the new shape with sensible defaults (empty string for constant; the first available source for output) so the user sees a meaningful starting state, not an unselected dropdown.

**Submit-time validation + manifest build.** `QueueEditor.submit` now builds a `ComposerStepView[]` (one entry per step with iterations + the referenced Test Case's I/O) and calls `validateStepWiring` per step before building the `QueueStep`. The first error (`step N: <message>`) is surfaced via the existing `validationError` channel — matches the existing per-step error style (`Step ${i + 1}: ...`). When wiring is valid, `buildInputValuesForStep` produces the final `inputValues`, attached to the `QueueStep` only when non-empty.

**Drive-by — `.tmp/` lint ignore.** The CLI integration tests in v1.5.3 added `**/tests/integration/.tmp-*/` to `.gitignore`, but ESLint kept walking those temp dirs and flagging the generated specs' unused `expect` imports. v1.6.1, v1.6.2, and the first attempt at v1.6.3 all had to clean `.tmp/` by hand before `make lint` would pass. Added `**/.tmp/**` and `**/.tmp-*/**` to `eslint.config.mjs`'s top-level `ignores` so lint stops re-discovering test artifacts.

**Tests.** 16 new cases in `packages/chrome-extension/tests/queue-input-wiring.test.ts` covering all three helpers + every cross-step rule (target out of range, target is current/later step, target is iterated, target doesn't declare the named output, multiple errors accumulate). 1 new case in `queues.test.ts` locking the `TestCaseSummary` shape with I/O, plus 2 existing cases updated to expect the new `{ inputs: [], outputs: [] }` fields. 454/454 tests passing (was 437).

### New

- `packages/chrome-extension/src/settings/queue-input-wiring.ts` — `availableOutputSources`, `validateStepWiring`, `buildInputValuesForStep` + types.
- `packages/chrome-extension/tests/queue-input-wiring.test.ts` — 16 unit tests.

### Changed

- `packages/chrome-extension/src/shared/queues.ts` — `TestCaseSummary` gains `inputs` + `outputs`; `listTestCases` populates them from `recording.json`.
- `packages/chrome-extension/src/settings/QueuesPanel.tsx` — `DraftStep` gains `inputValues`; `QueueEditor` renders `StepInputsSubsection` per step with declared inputs; `submit` validates wiring and builds `QueueStep.inputValues`; new `StepInputsSubsection` component at the bottom of the file.
- `packages/chrome-extension/src/settings/settings.css` — appends `.queue-step-block` + `.queue-step-inputs` + `.queue-step-inputs-list` + `.queue-step-input-row` styles (subtle left-rule + 5% currentColor tint to visually nest the inputs under their parent step).
- `packages/chrome-extension/tests/queues.test.ts` — 1 new case (v1.6.3 inputs/outputs surfacing); 2 existing cases updated for the widened summary shape.
- `eslint.config.mjs` — adds `**/.tmp/**` + `**/.tmp-*/**` to the top-level `ignores` list. Drive-by — see Solution.

### Fixed

- ESLint walking `.tmp/` test artifacts (CLI integration test scaffolding) caused recurring "unused `expect` import" failures across v1.6.1–v1.6.3 every time `make lint` ran after a test suite. Now eslint skips them just like `.gitignore` does.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/settings/queue-input-wiring.ts` | **New** — 3 pure helpers + types. |
| `packages/chrome-extension/src/shared/queues.ts` | **Edit** — `TestCaseSummary` widened with `inputs`/`outputs`; `listTestCases` populates them. |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | **Edit** — per-step Inputs subsection; wiring state on `DraftStep`; submit validates + builds `inputValues`; new `StepInputsSubsection` component. |
| `packages/chrome-extension/src/settings/settings.css` | **Edit** — `.queue-step-*` inputs styles (~55 lines). |
| `packages/chrome-extension/tests/queue-input-wiring.test.ts` | **New** — 16 tests. |
| `packages/chrome-extension/tests/queues.test.ts` | **Edit** — 1 new case + 2 updates for the widened `TestCaseSummary`. |
| `eslint.config.mjs` | **Edit** — ignore `.tmp/` + `.tmp-*/`. |
| `Versions/v1/v1.6/release-notes.md` | This entry. |

### Known issues / notes

- **Composer-side validation is the only gate.** The schema permits invalid cross-step references (e.g. `step: 999`, or pointing at an iterated step) by design — that's enforced here, in the composer, before manifest write. If a hand-edited `queue-N-slug.json` carries an invalid reference, the v1.6.4 renderer will emit a Test Case helper that fails to compile rather than rejecting at load. Acceptable for v1; cross-reference validation at load time can land in v1.7+ if the issue actually surfaces.
- **No re-validation of pre-v1.6.3 Queue manifests on load.** Editing a Queue whose steps reference a Test Case that has *gained* declared inputs since the Queue was last saved will land in the composer with the new declared inputs unwired — the user must wire them before Save will accept the form. Existing pre-v1.6 manifests with no `inputValues` keep working as long as their referenced Test Cases also have no declared inputs (the common case).
- **Manual verification in the Settings panel deferred** alongside v1.6.2's popup verification. Static checks all clean (`pnpm test` 454/454, `make build`, `make lint`, `pnpm --filter @webspec/chrome-extension build`). The Settings → Queues UI flow (per-step Inputs subsection appearance, mode dropdown swap, output-source picker scope across iterations) is straightforward React but hasn't been driven against a real recording yet.

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
