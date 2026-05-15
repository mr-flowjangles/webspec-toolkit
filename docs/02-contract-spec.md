# 02 — Contract artifact spec

How the `Analysis` discriminated union is shaped, validated, and evolved without breaking surfaces in lockstep. This doc is authoritative for any change that touches `packages/core/src/types/analysis.ts`.

`Analysis` is the only typed shape that crosses the Phase 1 / Phase 2 seam in `01-architecture.md`. Every analyzer produces one. Every renderer and UI surface consumes one. Nothing else.

## The three variants

```ts
type Analysis =
  | { kind: 'testPlan'; data: TestPlan; meta: AnalysisMeta }
  | { kind: 'a11yReport'; data: A11yReport; meta: AnalysisMeta }
  | { kind: 'workflowRecording'; data: WorkflowRecording; meta: AnalysisMeta };
```

Each variant pairs a `data` payload with a shared `meta` envelope. Sub-shapes (`TestCase`, `Finding`, `RecordedEvent`, `HardenedSelector`, `NetworkRequest`, etc.) live alongside, all defined as zod schemas with TypeScript types inferred from them.

`packages/core/src/types/analysis.ts` is the canonical definition. The TS file is the source of truth — this doc explains the rules; it does not duplicate the schema.

## Why each variant is shaped the way it is

### TestPlan — LLM-generated, structured for renderer consumption

The LLM emits a `TestPlan`, not raw spec text. The render pass is deterministic — it turns the plan's `cases[]` (each with `name`, `arrange`, `act`, `assert`) into source. This split exists because:

1. **Goldenable rendering.** Hand-written `TestPlan` fixtures snapshot-test the renderer. The LLM is tested separately via the adapter contract test (M1) and the e2e component fixtures (M2).
2. **Provider parity is structural, not textual.** A future second adapter returning different `cases[]` text for the same input is fine; returning a structurally different shape is not. We assert the shape, not the prose.
3. **No prompt-injection ladder.** The LLM never writes raw test code we then `eval`/import; it returns typed data, which the renderer formats. Zod validation at the seam is the gate.

**Note on the v1 pivot (v0.3.2):** TestPlan was introduced for the M2 Angular-source-→-Jest path (shipped in v0.3.0). After the pivot to a shift-left scope, that path is foundation-only — not on the v1 active path. **TestPlan stays unit-test-shaped**: the `arrange/act/assert` cases model is the right shape for unit tests but a category mismatch for e2e flows. M6 introduces a separate intermediate (`AmplifiedRecording` or similar — `scenarios[]` with typed `actions` + `assertions`) for the recording-→-Playwright path; same architectural pattern (LLM emits validated structured data, deterministic renderer formats it), but a shape that fits e2e. See `99-open-questions.md` for the path-C rationale.

### A11yReport — axe-shaped, augmented with our rule-tag normalization

`A11yReport` mirrors axe-core's output shape closely — `findings[]` with `ruleId`, `severity`, `selector`, `failureSummary`. The non-axe additions are:

- **`ruleSets[]` per finding** — axe tags rules with a flat list (`wcag21aa`, `section508`, etc.). We project that down to the two tags we care about so a 508 reviewer can scope. Rendering a "508 only" view is a filter on the array, not a re-analysis.
- **`engineVersion`** — pinned in the artifact so a stale recording can be re-rendered against an old report contract without ambiguity.

### WorkflowRecording — LLM-free at capture, LLM-polished at render

This is the most important shape choice in M1. **The recorder never calls the LLM.** Capture is a deterministic event trace from the Chrome content script. The LLM only enters Phase 2, when the e2e renderer (M6) takes a `WorkflowRecording` and produces Playwright `.spec.ts`.

Why the split:

1. **Privacy.** Recordings can contain PHI/PII (federal customers — see `99-open-questions.md`). Pushing the entire DOM-event trace through an LLM by default would mean a third-party model vendor sees it. Keeping LLM-free at capture means a recording can be exported, scrubbed, and _only then_ rendered with LLM polish.
2. **Cost.** Every recording is an LLM call otherwise. The render pass is a one-time cost when the user wants a `.spec.ts`; the recording itself is cheap.
3. **The recorder works without a key.** Per `mission.md` — the LLM is value-add (test names, assertions, selector consolidation), not load-bearing. A team without a Claude/OpenAI key can still record and emit a deterministic Playwright spec.
4. **Replayability.** A serialized `WorkflowRecording` JSON is the audit trail. It can be diffed, re-rendered, and re-graded later without re-recording.

A `WorkflowRecording` carries two required user-supplied fields — `name` and `description` — captured in the Chrome popup before the recorder is armed. The renderer uses `name` as the `test()` title and emits `description` as a `// `-prefixed comment block immediately under the `test(...)` opener (multi-line descriptions become multiple comment lines). These also serve as the headline + intent in any downstream test report, which is why they're captured at the user's keyboard, not inferred by the LLM.

v1.2 adds an **optional** `runAs: string | null` field to `WorkflowRecording`, captured alongside name and description in the naming form. Captured-but-not-yet-rendered in v1.2; v1.3 makes it functional by emitting an auth step (`context.setExtraHTTPHeaders` for the default header-injection mode) driven by a project-level `webspec.config.ts`. The field stays optional so older recordings (and recordings made when the project has no auth config) continue to validate. See `08-test-library.md` for the full v1.2 → v1.4 design.

So the renderer is two-pass:

- **Pass 1 (deterministic):** each `RecordedEvent` → one Playwright action. Selectors come from the recording's `HardenedSelector.preferred`. The `test()` title comes from `recording.name`; the leading comment from `recording.description`. Always works.
- **Pass 2 (LLM polish, optional):** given the deterministic spec + the event trace + the network log, the LLM inserts assertions inferred from observed state changes and proposes selector consolidations. It does **not** rename the test — the user's name is canonical. Skipped when no provider key is configured.

## The shared envelope (`AnalysisMeta`)

Every variant carries:

| Field           | Purpose                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | Frozen string literal, currently `'1'`. **Bumped only via the rules below.**                                                                          |
| `toolVersion`   | The semver of `@webspec/core` that produced the artifact. Diagnostic, not load-bearing.                                                          |
| `createdAt`     | ISO-8601. Diagnostic.                                                                                                                                 |
| `source`        | `{kind, ref}` pointing at the input (file path, URL, recording-session ID).                                                                           |
| `config`        | The resolved config at production time. Typed `unknown` in `core` to keep `core/types` free of a `@webspec/config` dependency; consumers narrow. |

`schemaVersion` is the load-bearing field. It's the version every renderer checks before rendering, the version every cache key includes, and the version every release-notes entry must mention if it changed.

## The IR evolution rule

Every change to a sub-shape, every variant added or renamed, every field's type changing — falls into exactly one of three buckets:

### Bucket A — additive, optional, backward-compatible

A new optional field on an existing variant. A new entry in an existing `enum` that renderers fall through with a default. A non-required entry in a discriminated union (e.g., a new `RecordedEvent.kind` that older renderers can ignore).

**Action:** ship it. **Do not bump `schemaVersion`.** Update the zod schema, update the inferred types, update renderers that should _handle_ the new field (they're free to ignore it). Note in the release notes under "Changed."

The test for whether something is truly additive: write down the old schema and the new one, then ask — does every artifact valid under the old schema parse under the new one? If yes, it's additive.

### Bucket B — renaming or restructuring with a one-version overlap

A field renamed. A nested shape reshuffled. A required field becoming optional with a default that older artifacts won't carry.

**Action:** ship the new schema **alongside** the old one, gated on `schemaVersion`. Renderers handle both versions for one release cycle. Bump `schemaVersion` on the next release after the migration window. Tag the old shape `@deprecated` in the zod file.

Fixtures from the old version stay in the test suite until `schemaVersion` flips.

### Bucket C — incompatible change (variant removed, required field changed type)

A variant is deleted. A required field changes from `string` to `string[]`. The discriminator `kind` namespace is reorganized.

**Action:** **bump `schemaVersion` to a new literal** (`'1'` → `'2'`). Renderers gate on `schemaVersion` and refuse to render older artifacts with a clear error pointing at the migration. Provide a migration helper in `packages/core/src/types/migrations/v1-to-v2.ts` that takes a v1 `Analysis` and returns a v2 (when reasonably possible).

Bucket C is rare. Most changes go through A or B. If a proposed change feels like Bucket C, default to asking whether the change is actually load-bearing — almost always there's a Bucket A way to do it instead.

## Non-rules (things this spec deliberately does NOT prescribe)

- **The exact prompt shape sent to the LLM.** That's a per-analyzer detail (see `core/analyze/test-plan` in M2, `core/render/e2e` in M6). The contract is the validated `Analysis` shape coming out, not the prompt going in.
- **Caching strategy for repeat analyses.** See `99-open-questions.md`.
- **How `source.ref` is encoded for `recordingSession` sources.** When the Chrome ext exports a recording, the ref is whatever identifier we pick at M5 — most likely a UUID generated at recording start. Locked at M5 implementation, not here.

## Why a custom IR instead of just using axe / Playwright shapes directly

Considered and rejected: making `A11yReport` literally `axe.Result` and `WorkflowRecording` literally Playwright's codegen JSON. The case for it: less code in `core/types`. The case against — and why we wrote our own:

1. **Two phase boundaries.** axe gives us "what's wrong now." Playwright codegen gives us "what the user did." Neither has a `meta` envelope or our `ruleSets` projection. The renderer needs both.
2. **Provider portability.** A future Cypress renderer (post-v1) needs the same `WorkflowRecording`, not a Playwright-specific JSON. Coupling to one vendor's runtime shape would force a translation layer at the seam, which defeats the seam.
3. **Schema evolution lives with us.** axe and Playwright change their shapes on their schedule. Pinning ours means our renderers don't break when an upstream tag is added, and our deprecation cycle is ours.

The cost is keeping our shapes in sync with what axe and Playwright actually produce — handled in the analyzers (Phase 1), not at the seam.

## What the contract test guarantees (M1)

`packages/core/tests/llm/bedrock.test.ts` pins these properties of the seam:

- The adapter always validates the LLM's response against the provided zod schema before returning. Invalid responses surface as `LLMValidationError` with the issue list, never as a malformed value.
- `tool_choice` is always forced to the named schema. The adapter cannot return text that "happens to look like" the schema — it must come from a tool_use block.
- The system prompt (when provided) is always wrapped with `cache_control: 'ephemeral'`. Any future provider must do the same in spirit (or document why caching isn't applicable).
- `providerId` is stable per (provider, model) pair (e.g. `bedrock:us.anthropic.claude-opus-4-5-20251101-v1:0`). Cache keys and telemetry depend on this.
- Transport errors propagate; only validation errors are wrapped.

Any future adapter (a second Bedrock-hosted model, a direct API for OSS users, etc.) must satisfy a structurally analogous test. The adapter source files differ; the contract is what's invariant.
