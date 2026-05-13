# v0.2

## v0.2.0 — Contract artifact + LLM provider seam (2026-05-07)

### Problem

M0 gave us a buildable monorepo. The next step was the architecturally load-bearing one: lock the `Analysis` discriminated union and the `LLMProvider` interface in code. Every analyzer (M2 source-driven, M4 a11y, M5 recorder) and every renderer (M2 test, M4 report, M6 e2e) consumes one of these two shapes. Get them wrong here and every later milestone has to rework. Get the LLM seam wrong and the LLM-provider-agnostic constraint can't hold.

A second non-negotiable surfaced during M1: Bellese's federal-customer work runs on AWS-resident infrastructure for compliance reasons, so all Anthropic-model traffic goes through **Amazon Bedrock**, not the direct Anthropic API. The seam doesn't change — that's exactly what the seam was designed for — but the v1 adapter does.

### Solution

Three pieces of code, one design doc, one contract test:

1. **`packages/core/src/types/analysis.ts`** — the canonical zod schema definition for `Analysis` and all sub-shapes. TypeScript types inferred via `z.infer`. `Analysis` is a 3-arm discriminated union (`testPlan` | `a11yReport` | `workflowRecording`) with a shared `AnalysisMeta` envelope carrying `schemaVersion: '1'`.
2. **`packages/core/src/llm/provider.ts`** — the vendor-neutral `LLMProvider` interface. `complete<S extends z.ZodType>(args): Promise<z.infer<S>>` — caller passes a zod schema, adapter routes to its provider's structured-output mechanism, validates the response, returns the typed value. `LLMValidationError` is the only wrapped error class; transport errors propagate.
3. **`packages/core/src/llm/bedrock.ts`** — the v1 adapter. Uses `@anthropic-ai/bedrock-sdk` with the standard AWS SDK default credential chain (env / `~/.aws/credentials` / IAM role) — no API key. Forces structured output via `tools` + `tool_choice: {type: 'tool', name}`, `z.toJSONSchema()` (zod 4 native) for the tool's `input_schema`, adaptive thinking + `effort: 'high'`, and `cache_control: 'ephemeral'` on the system prompt for prompt caching. The Bedrock SDK client is injectable via the constructor for tests.
4. **`packages/core/tests/llm/bedrock.test.ts`** — 12 fixture-based contract tests pinning the seam invariants without hitting live AWS.
5. **`docs/02-contract-spec.md`** — the IR-evolution rule (Buckets A/B/C), the rationale for each variant's shape, and what the contract test guarantees.

### New

- **`Analysis` zod schema and inferred types** (`packages/core/src/types/analysis.ts`).
  - `AnalysisSchema` — discriminated union, exported with `CURRENT_SCHEMA_VERSION = '1'`.
  - `TestPlanSchema` and sub-shapes: `SurfaceInputSchema`, `SurfaceOutputSchema`, `SurfaceMethodSchema`, `LifecycleHookSchema`, `InjectedDepSchema`, `TestCaseSchema`.
  - `A11yReportSchema` + `FindingSchema`, `A11yRuleTagSchema` (`'wcag21aa' | 'section508'`), `A11ySeveritySchema`.
  - `WorkflowRecordingSchema` + `RecordedEventSchema` (7-arm discriminated union: click, input, change, submit, keydown, navigate, assertObserved), `HardenedSelectorSchema`, `ObservedStateSchema`, `NetworkRequestSchema`.
  - Inferred TypeScript types exported alongside each schema (`type Analysis = z.infer<typeof AnalysisSchema>`, etc.).
- **`LLMProvider` interface** (`packages/core/src/llm/provider.ts`). `ChatMessage`, `Role`, `CompletionRequest<S>`. `LLMValidationError` carries `providerId`, `schemaName`, the zod issue list, and the raw response so callers can decide whether to retry. **No vendor or cloud SDK is imported in this file or anywhere in `core` outside of the corresponding adapter module.**
- **`BedrockAdapter`** (`packages/core/src/llm/bedrock.ts`).
  - Default model: `us.anthropic.claude-opus-4-5-20251101-v1:0` (cross-region inference profile). Override via `BedrockAdapterOptions.model` based on what's available in your AWS account.
  - Auth: standard AWS SDK default credential chain. No API key, no `apiKey` constructor option.
  - Optional `awsRegion` constructor option — falls back to the SDK default (`AWS_REGION` env, then `us-east-1`).
  - Default `max_tokens`: 16,000 (per-call override via `args.maxTokens`).
  - Default thinking: `{type: 'adaptive'}`.
  - Default `output_config.effort`: `'high'` — recommended minimum for intelligence-sensitive work.
  - Structured output via `tools` + `tool_choice: {type: 'tool', name}`. The model can't return text that "happens to look like" the schema — it must come from a tool_use block.
  - System prompt (when provided) wrapped with `cache_control: {type: 'ephemeral'}` so long stable prefixes cache across requests.
  - Validates the tool_use input via the supplied zod schema; surfaces validation failures as `LLMValidationError`.
  - SDK client injectable via constructor (`opts.client`) for tests.
  - `providerId`: `bedrock:<model-id>` (e.g. `bedrock:us.anthropic.claude-opus-4-5-20251101-v1:0`).
- **Contract test** (`packages/core/tests/llm/bedrock.test.ts`). 12 tests, no live AWS calls. Asserts: happy-path validated return; stable `providerId` per (provider, model) pair; default model targets Opus cross-region profile; `tool_choice` forcing the named schema; `input_schema` inlined without `$schema` header; `cache_control` on system prompt; system field omitted when no system prompt; adaptive+effort defaults; per-call `maxTokens` override; missing tool_use block → `LLMValidationError`; mismatched tool name → `LLMValidationError`; zod validation failure → `LLMValidationError` with issue path; transport errors propagate as-is.
- **`docs/02-contract-spec.md`** — IR-evolution rule:
  - Bucket A (additive, optional, backward-compatible) — ship without bumping `schemaVersion`.
  - Bucket B (rename / restructure, one-version overlap) — ship alongside, bump after migration window.
  - Bucket C (incompatible, rare) — bump `schemaVersion` literal, provide migration helper, gate renderers.
- **Core deps:** `zod ^4.4.3`, `@anthropic-ai/bedrock-sdk ^0.29.1` added to `@bellese/test-core`. (No `zod-to-json-schema`; zod 4 has native `z.toJSONSchema()`. No direct `@anthropic-ai/sdk` — Bedrock is the v1 path.)
- **ESLint:** added `argsIgnorePattern: '^_'` / `varsIgnorePattern: '^_'` etc. to `@typescript-eslint/no-unused-vars` so `_`-prefixed names signal "intentionally unused" in destructuring patterns.

### Changed

- **`docs/mission.md`** — locked decisions now name AWS Bedrock + standard AWS credential chain explicitly, replacing the prior "BYOK with API keys" framing. Out-of-scope updated: "Bellese-managed LLM proxy or shared AWS / Bedrock allocation infrastructure" (was: shared API key infra). The "what the tool must do" list now references Bedrock + the provider-agnostic seam instead of "let the user pick their LLM provider."
- **`docs/00-overview.md`** — VS Code extension settings line says "AWS region/profile settings" instead of "BYOK settings."
- **`docs/01-architecture.md`** — the LLM provider adapter section now describes Bedrock as the v1 adapter (with the seam admitting future providers without renderer changes). Subsystem-responsibilities table updated: `core/llm` talks to `@anthropic-ai/bedrock-sdk` plus future SDKs.
- **`docs/07-build-plan.md`** — v1 DoD bullet updated to reference Bedrock + provider-agnostic seam. M1 ticked boxes now describe `BedrockAdapter` (was `AnthropicAdapter`). M5 (Chrome ext): explicit no-LLM-auth rationale (Chrome extensions can't safely hold AWS credentials). M7 (VS Code): "AWS region/profile" settings instead of API-key SecretStorage. M8 reframed: second adapter choice (which Bedrock variant or alternative) deferred to that milestone.
- **`docs/99-open-questions.md`** — the LLM-proxy question reframed: "Should we centralize Bedrock access (Bellese-shared AWS account / proxy)?" — was about API keys; now about AWS access. Notes the operational cost of running an HTTP proxy in front of Bedrock vs the simpler per-developer-AWS path.
- **`CLAUDE.md`** — locked tech-choices entry for LLM updated: Bedrock, AWS credential chain, BedrockAdapter, no vendor SDK imports outside the adapter.
- `packages/core/src/index.ts` — replaced the M0 stub export. Now re-exports the analysis schemas/types, the `LLMProvider` interface + `LLMValidationError`, and `BedrockAdapter`. Includes a comment marking `./llm/bedrock.js` as the only Bedrock-SDK-importing module — browser bundles must exclude it.
- `eslint.config.mjs` — see ESLint note above.

### Fixed

- (n/a — first implementation milestone)

### Files Changed

| File | Change |
| ---- | ------ |
| `packages/core/package.json` | Changed — added `zod ^4.4.3` + `@anthropic-ai/bedrock-sdk ^0.29.1` |
| `packages/core/src/index.ts` | Changed — real exports (analysis types, LLMProvider, BedrockAdapter) replacing the M0 stub |
| `packages/core/src/types/analysis.ts` | New — zod schemas + inferred TS types for the full `Analysis` IR |
| `packages/core/src/llm/provider.ts` | New — `LLMProvider` interface, `CompletionRequest`, `LLMValidationError` |
| `packages/core/src/llm/bedrock.ts` | New — `BedrockAdapter` using `@anthropic-ai/bedrock-sdk` (AWS credential chain, tools + tool_choice, prompt caching, injectable client) |
| `packages/core/tests/llm/bedrock.test.ts` | New — 12 fixture-based contract tests |
| `docs/mission.md` | Changed — Bedrock-first locked decisions; out-of-scope and "what the tool must do" updated |
| `docs/00-overview.md` | Changed — VS Code settings reference (AWS, not BYOK) |
| `docs/01-architecture.md` | Changed — LLM provider section + subsystem table reflect Bedrock as v1 |
| `docs/02-contract-spec.md` | New — schemaVersion evolution rule, variant rationale, contract test guarantees (Bedrock-flavored) |
| `docs/07-build-plan.md` | Changed — v1 DoD, M1 ticked boxes, M5 / M7 settings, M8 reframed |
| `docs/99-open-questions.md` | Changed — LLM-proxy question reframed for AWS / Bedrock |
| `CLAUDE.md` | Changed — locked tech-choices LLM line |
| `eslint.config.mjs` | Changed — `^_`-prefix unused-vars exception |
| `pnpm-lock.yaml` | Changed — new deps |
| `Versions/v0/v0.2.0/release-notes.md` | New — this file |

