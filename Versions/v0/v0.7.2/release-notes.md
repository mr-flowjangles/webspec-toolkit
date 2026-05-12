# v0.7.2 — LLM Amplifier (2026-05-12)

## Problem

v0.7.0 closed the deterministic loop (recording → Playwright spec) and v0.7.1 landed the `AmplifiedRecording` IR. What was still missing: the LLM that *produces* the amplified IR from a captured `WorkflowRecording`. Without it, the IR has no producer and the v1 differentiator (negative scenarios alongside the recorded happy path) doesn't exist.

The four planning decisions from the walk-through:

1. **Input**: the LLM sees the full `WorkflowRecording` JSON (events + selectors + navigation + start URL). Not just the events array; not DOM snapshots.
2. **Constraint**: a fixed list of plausible negative archetypes in the system prompt, with explicit instructions to pick only the 2–4 most applicable.
3. **Volume**: 1 happy + 2–4 negatives = ~3–5 scenarios per recording. No hard ceiling enforced in code.
4. **Caching**: standard M1 pattern — system prompt cached via the adapter, user prompt (recording JSON) varies per call. Structured output via `tools` + `tool_choice` over `AmplifiedRecordingSchema`.

## Solution

Three pieces in `@webspec/core`, plus a `--provider` flag on the CLI:

**`SYSTEM_PROMPT` and `formatUserPrompt`** in `packages/core/src/analyze/amplify/prompt.ts`. The system prompt frames the model as a Playwright test author, enumerates the action/assertion sets the IR allows, maps each `RecordedEvent` kind (and each `navigate.reason`) to a target action, lists the five negative archetypes with explicit "pick 2–4 most plausible — skip ones that don't apply," and explicitly forbids fabricated selectors and happy-scenario drift. The user prompt is the `WorkflowRecording` stringified inside a fenced JSON block.

**`AmplifyAnalyzer`** in `packages/core/src/analyze/amplify/analyzer.ts`. Constructor takes an `LLMProvider`. The single `amplify(recording)` method calls `llm.complete({ system, messages, schema: AmplifiedRecordingSchema, schemaName: 'AmplifiedRecording' })` and returns the validated result. Zod validation lives in the adapter (same gate the M2 TestPlan analyzer uses); a drift between the LLM's output and the schema bubbles as `LLMValidationError` rather than emitting a broken spec.

**CLI integration.** `webspec record-to-spec` gains a `--provider <name>` flag. Valid values for v1: `bedrock`. When set, the deterministic pass is replaced — the CLI constructs a `BedrockAdapter`, calls `AmplifyAnalyzer.amplify`, and renders the result with `renderAmplifiedPlaywrightSpec` (the v0.7.1 renderer that emits one `test()` block per scenario). Without `--provider`, behavior is unchanged from v0.7.0 — same deterministic happy-path spec.

**Tests use a fake `LLMProvider`** (vitest mock) so the suite runs with zero AWS dependency. Live Bedrock verification is gated on AWS credentials being set up and lives outside this suite; the day those land, the amplifier works end-to-end without further code changes.

## New

- `packages/core/src/analyze/amplify/prompt.ts` — `SYSTEM_PROMPT` (cacheable) + `formatUserPrompt(recording)`.
- `packages/core/src/analyze/amplify/analyzer.ts` — `AmplifyAnalyzer` class.
- `packages/core/tests/analyze/amplify/prompt.test.ts` — 7 tests asserting load-bearing instructions are present (frames the model, lists archetypes, enumerates action/assertion kinds, forbids drift, maps every `navigate.reason`, embeds recording JSON in the user prompt).
- `packages/core/tests/analyze/amplify/analyzer.test.ts` — 4 tests covering the analyzer with a fake provider (returns validated response, passes recording through, requests `AmplifiedRecordingSchema` validation, propagates provider errors).
- `--provider <name>` flag on `webspec record-to-spec`. 3 new arg-parser tests (accepts `bedrock`, rejects unknown value, rejects missing value).

## Changed

- `packages/core/src/index.ts` — export `AmplifyAnalyzer` plus the prompt builders (renamed to `AMPLIFY_SYSTEM_PROMPT` / `formatAmplifyUserPrompt` to avoid colliding with the M2 TestPlan prompt symbols).
- `packages/cli/src/args.ts` — extend `RecordToSpecCommand` with optional `provider: 'bedrock'`. `parseRecordToSpec` validates `--provider` against a small allowlist; updates the help text to mention amplified mode.
- `packages/cli/src/commands/record-to-spec.ts` — when `cmd.provider` is set, construct the matching `LLMProvider`, run the analyzer, render with `renderAmplifiedPlaywrightSpec`. Otherwise the v0.7.0 deterministic path. `RecordToSpecResult` gains `scenarioCount` and `amplified` flag.
- `packages/cli/src/index.ts` — stderr log now mentions `(amplified, N scenarios)` when amplified.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/analyze/amplify/prompt.ts` | New — system + user prompt for the amplifier. |
| `packages/core/src/analyze/amplify/analyzer.ts` | New — `AmplifyAnalyzer` wrapping `LLMProvider.complete` with the `AmplifiedRecordingSchema` validation seam. |
| `packages/core/tests/analyze/amplify/prompt.test.ts` | New — 7 prompt-shape tests. |
| `packages/core/tests/analyze/amplify/analyzer.test.ts` | New — 4 analyzer tests with a fake `LLMProvider`. |
| `packages/core/src/index.ts` | Export `AmplifyAnalyzer` + renamed prompt helpers. |
| `packages/cli/src/args.ts` | Add `--provider` flag and `LLMProviderId` type. Update help text. |
| `packages/cli/src/commands/record-to-spec.ts` | Branch on `cmd.provider`: amplified path via `AmplifyAnalyzer` + `renderAmplifiedPlaywrightSpec`; deterministic path unchanged. |
| `packages/cli/src/index.ts` | Stderr log mentions amplified + scenario count. |
| `packages/cli/tests/args.test.ts` | 3 new `--provider` parsing tests. |
| `Versions/v0/v0.7.2/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: **232/232** tests pass (218 prior + 14 new — 11 amplifier + 3 arg-parser). Type-check clean across `core` and `cli`. CLI build clean.

### Deterministic-path smoke (unchanged)

```sh
$ node packages/cli/dist/index.js record-to-spec /tmp/select-recording.json --out /tmp/smoke.spec.ts
webspec record-to-spec: rendered 3 events → /tmp/smoke.spec.ts
```

Output identical to v0.7.0. No regression.

### Amplified-path smoke (deferred — needs AWS creds)

```sh
$ node packages/cli/dist/index.js record-to-spec recording.json --provider bedrock
webspec record-to-spec: rendered N events (amplified, M scenarios) → recording.spec.ts
```

The amplified path's unit-test coverage (analyzer with fake provider) is complete; live verification is gated on AWS access. The day those credentials land, this command runs end-to-end without further code changes.

## What's next

- **v0.7.3** — Integration test against a local fixture. Hand-written HTML under `tests/fixtures/playwright-target/`, a hand-written `WorkflowRecording` JSON of the user flow on it, render via `webspec record-to-spec`, run the emitted spec through `@playwright/test`, assert it passes. Closes the "spec compiles and actually executes" gap.
- **v1.0.0** — M6 done = v1 done. The remaining v1 DoD items get checked off (README quickstart, recorder-render parity verified on the three-site smoke).
