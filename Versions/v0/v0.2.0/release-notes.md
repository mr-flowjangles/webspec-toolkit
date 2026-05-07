# v0.2.0 — Contract artifact + LLM provider seam (2026-05-07)

## Problem

M0 gave us a buildable monorepo. The next step was the architecturally load-bearing one: lock the `Analysis` discriminated union and the `LLMProvider` interface in code. Every analyzer (M2 source-driven, M4 a11y, M5 recorder) and every renderer (M2 test, M4 report, M6 e2e) consumes one of these two shapes. Get them wrong here and every later milestone has to rework. Get the LLM seam wrong and the LLM-provider-agnostic constraint can't hold.

## Solution

Three pieces of code, one design doc, one contract test:

1. **`packages/core/src/types/analysis.ts`** — the canonical zod schema definition for `Analysis` and all sub-shapes. TypeScript types inferred via `z.infer`. `Analysis` is a 3-arm discriminated union (`testPlan` | `a11yReport` | `workflowRecording`) with a shared `AnalysisMeta` envelope carrying `schemaVersion: '1'`.
2. **`packages/core/src/llm/provider.ts`** — the vendor-neutral `LLMProvider` interface. `complete<S extends z.ZodType>(args): Promise<z.infer<S>>` — caller passes a zod schema, adapter routes to its provider's structured-output mechanism, validates the response, returns the typed value. `LLMValidationError` is the only wrapped error class; transport errors propagate.
3. **`packages/core/src/llm/anthropic.ts`** — the first adapter. Uses `tools` + `tool_choice: {type: 'tool', name}` to force structured output, `z.toJSONSchema()` (zod 4 native) for the tool's `input_schema`, adaptive thinking with `effort: 'high'`, and `cache_control: 'ephemeral'` on the system prompt for prompt caching of long stable prefixes. The Anthropic SDK client is injectable via the constructor for tests.
4. **`packages/core/tests/llm/anthropic.test.ts`** — 11 fixture-based contract tests pinning the seam invariants without hitting the live API.
5. **`docs/02-contract-spec.md`** — the IR-evolution rule (Buckets A/B/C), the rationale for each variant's shape, and what the contract test guarantees.

## New

- **`Analysis` zod schema and inferred types** (`packages/core/src/types/analysis.ts`).
  - `AnalysisSchema` — discriminated union, exported with `CURRENT_SCHEMA_VERSION = '1'`.
  - `TestPlanSchema` and sub-shapes: `SurfaceInputSchema`, `SurfaceOutputSchema`, `SurfaceMethodSchema`, `LifecycleHookSchema`, `InjectedDepSchema`, `TestCaseSchema`.
  - `A11yReportSchema` + `FindingSchema`, `A11yRuleTagSchema` (`'wcag21aa' | 'section508'`), `A11ySeveritySchema`.
  - `WorkflowRecordingSchema` + `RecordedEventSchema` (7-arm discriminated union: click, input, change, submit, keydown, navigate, assertObserved), `HardenedSelectorSchema`, `ObservedStateSchema`, `NetworkRequestSchema`.
  - Inferred TypeScript types exported alongside each schema (`type Analysis = z.infer<typeof AnalysisSchema>`, etc.).
- **`LLMProvider` interface** (`packages/core/src/llm/provider.ts`). `ChatMessage`, `Role`, `CompletionRequest<S>`. `LLMValidationError` carries `providerId`, `schemaName`, the zod issue list, and the raw response so callers can decide whether to retry.
- **`AnthropicAdapter`** (`packages/core/src/llm/anthropic.ts`).
  - Default model: `claude-opus-4-7`.
  - Default `max_tokens`: 16,000 (per-call override via `args.maxTokens`).
  - Default thinking: `{type: 'adaptive'}` (off-by-default on Opus 4.7; we opt in).
  - Default `output_config.effort`: `'high'` — recommended minimum for intelligence-sensitive work per the Anthropic SDK skill.
  - Structured output via `tools` + `tool_choice: {type: 'tool', name}`. The model can't return text that "happens to look like" the schema — it must come from a tool_use block.
  - System prompt (when provided) wrapped with `cache_control: {type: 'ephemeral'}` so long stable prefixes cache across requests.
  - Validates the tool_use input via the supplied zod schema; surfaces validation failures as `LLMValidationError`.
  - SDK client injectable via constructor (`opts.client`) for tests.
- **Contract test** (`packages/core/tests/llm/anthropic.test.ts`). 11 tests, no live API calls. Asserts: happy-path validated return; `tool_choice` forcing the named schema; `input_schema` inlined without `$schema` header; `cache_control` on system prompt; system field omitted when no system prompt; adaptive+effort defaults; per-call `maxTokens` override; missing tool_use block → `LLMValidationError`; mismatched tool name → `LLMValidationError`; zod validation failure → `LLMValidationError` with issue path; transport errors propagate as-is; stable `providerId` per (provider, model) pair.
- **`docs/02-contract-spec.md`** — IR-evolution rule:
  - Bucket A (additive, optional, backward-compatible) — ship without bumping `schemaVersion`.
  - Bucket B (rename / restructure, one-version overlap) — ship alongside, bump after migration window.
  - Bucket C (incompatible, rare) — bump `schemaVersion` literal, provide migration helper, gate renderers.
- **Core deps:** `zod ^4.4.3`, `@anthropic-ai/sdk ^0.95.1` added to `@bellese/test-core`. (No `zod-to-json-schema`; zod 4 has native `z.toJSONSchema()`.)
- **ESLint:** added `argsIgnorePattern: '^_'` / `varsIgnorePattern: '^_'` etc. to `@typescript-eslint/no-unused-vars` so `_`-prefixed names signal "intentionally unused" in destructuring patterns.

## Changed

- `packages/core/src/index.ts` — replaced the M0 stub export. Now re-exports the analysis schemas/types, the `LLMProvider` interface + `LLMValidationError`, and `AnthropicAdapter`. Includes a comment marking `./llm/anthropic.js` as the only Anthropic-SDK-importing module — browser bundles must exclude it.
- `eslint.config.mjs` — see ESLint note above.

## Fixed

- (n/a — first implementation milestone)

## Files Changed

| File | Change |
| ---- | ------ |
| `packages/core/package.json` | Changed — added `zod`, `@anthropic-ai/sdk` as dependencies |
| `packages/core/src/index.ts` | Changed — real exports replacing the M0 stub |
| `packages/core/src/types/analysis.ts` | New — zod schemas + inferred TS types for the full `Analysis` IR |
| `packages/core/src/llm/provider.ts` | New — `LLMProvider` interface, `CompletionRequest`, `LLMValidationError` |
| `packages/core/src/llm/anthropic.ts` | New — `AnthropicAdapter` (tools + tool_choice, prompt caching, injectable client) |
| `packages/core/tests/llm/anthropic.test.ts` | New — 11 fixture-based contract tests |
| `docs/02-contract-spec.md` | New — schemaVersion evolution rule, variant rationale, contract test guarantees |
| `docs/07-build-plan.md` | Changed — M1 boxes ticked |
| `eslint.config.mjs` | Changed — `^_`-prefix unused-vars exception |
| `pnpm-lock.yaml` | Changed — new deps |
| `Versions/v0/v0.2.0/release-notes.md` | New — this file |
