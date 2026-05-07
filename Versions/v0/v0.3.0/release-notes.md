# v0.3.0 — Test generator (Phase 1 + Phase 2 for tests) (2026-05-07)

## Problem

M1 locked the contract artifact and the LLM seam. M2 is the first feature milestone — the source-driven Jest test generator that the CLI (M3) and VS Code extension (M7) both depend on. Without it, the rest of the build plan has no concrete capability to demo against. The architecturally interesting question for M2: how to keep the LLM from fabricating a different component surface than what's actually in source. The answer baked into M1's contract test pattern carries forward: parse the surface deterministically, hand the LLM ONLY the cases it needs to write, validate against zod, never trust generated structure.

## Solution

Five pieces of code, three fixture components, three hand-authored TestPlans, and a two-test-file integration suite:

1. **`packages/core/src/analyze/test-plan/parser.ts`** — `ts-morph`-based extractor. Pure function `parseComponentSurface(filePath)` (plus a `parseComponentSurfaceFromText` variant for in-memory tests). Returns `ParsedComponentSurface` carrying `unit`, `surface`, and `styleHints` matching the M1 `TestPlan` shape minus `cases[]`.
2. **`packages/core/src/analyze/test-plan/prompt.ts`** — long stable system prompt (cacheable via the adapter's `cache_control`) describing the assistant's role, Angular Jest conventions, signal-API guidance, and the `arrange`/`act`/`assert` fragment contract. Per-component user prompt formats the parsed surface as a structured brief.
3. **`packages/core/src/analyze/test-plan/analyzer.ts`** — `TestPlanAnalyzer` class taking an `LLMProvider`. The LLM returns ONLY `cases[]` (validated against `z.object({cases: z.array(TestCaseSchema)})`); the analyzer assembles the full `TestPlan` locally. Returns the full `Analysis` envelope.
4. **`packages/core/src/render/test/renderer.ts`** — pure function `renderTestPlan(plan): string`. Deterministic, goldenable, browser-safe (no Node `path`). Emits `import { ComponentFixture, TestBed }`, the standalone `imports: [Component]` pattern, standard provider mocks for `HttpClient` (→ `provideHttpClient() + provideHttpClientTesting()`) and `Router` (→ `provideRouter([])`), generic `{ provide: X, useValue: {} }` stubs for unrecognized deps, and `it()` blocks with arrange/act/assert comments.
5. **Tests:** 16 parser unit tests (decorator + signal forms, lifecycle, deps), 15 renderer golden tests (incl. an inline-snapshot full-layout assertion), 18 integration tests against three fixture components.

The full live-Bedrock + Jest-against-real-Angular-app verification (the literal v0.3.0 done-when criterion from the build plan) is **deferred to M3** — see Changed below. M3's CLI work needs the same Angular fixture app for its own e2e, so building it now and again would be duplicate effort.

## New

- **TestPlanAnalyzer pipeline** (`packages/core/src/analyze/test-plan/`):
  - `parser.ts` — extracts `name` (class name), `kind: 'component'`, `inputs` (`@Input` + `@Input({required:true})` + `input()` + `input.required<T>()`), `outputs` (`@Output` w/ `EventEmitter<T>` unwrapped, `output<T>()`), `publicMethods` (filtered to skip private/protected/lifecycle), `lifecycle` (the 8 standard hooks), `deps` (`inject()` field initializers + constructor parameters), `styleHints` (`useStandalone`, `useSignals`, `useInject`). Also exports `parseComponentSurfaceFromText(name, source)` for in-memory testing.
  - `prompt.ts` — `SYSTEM_PROMPT` constant + `formatUserPrompt(parsed)`. The system prompt forbids private-member assertions, `fdescribe`/`fit`, mocking standard Angular machinery, and `console.log` in test bodies.
  - `analyzer.ts` — `TestPlanAnalyzer { constructor(llm: LLMProvider); analyze(opts): Promise<Analysis> }`. Throws `NoComponentFoundError` if the file has no `@Component` class.
- **TestRenderer** (`packages/core/src/render/test/renderer.ts`):
  - `renderTestPlan(plan: TestPlan): string`. Browser-safe (no `path` import; uses string ops for filename → import path conversion).
  - Recognized standard deps mapped to standard providers: `HttpClient` and `Router`. Unrecognized deps fall through to a `{ provide: X, useValue: {} }` stub.
  - Per-case extra `imports[]` are merged into the `@angular/core/testing` import line (covers `By`, `DebugElement`, etc.).
- **Three fixture components** (`packages/core/tests/fixtures/components/`):
  - `greeter.component.ts` — presentational, decorator-based `@Input`/`@Output`, no deps.
  - `user-list.component.ts` — service-injecting via constructor DI; `HttpClient`, `Router`, and a custom `UserService` (the latter exercises the generic-stub fallback).
  - `signal-counter.component.ts` — modern signal API: `input()`, `input.required<T>()`, `output<T>()`, `inject()`, `signal()`, `computed()`.
- **Three hand-authored TestPlans** (`packages/core/tests/fixtures/test-plans/*.json`) snapshotting what a competent LLM would emit for each fixture. Used by the integration test to verify renderer output without hitting a live LLM.
- **Tests (61 total, +43 new in M2):**
  - `tests/analyze/test-plan/parser.test.ts` — 16 unit tests.
  - `tests/render/test/renderer.test.ts` — 15 golden tests including a full inline snapshot.
  - `tests/integration/test-plan.integration.test.ts` — 18 tests pinning the parser → renderer round-trip against the three fixture components. Asserts: parser surface aligns with hand-authored plan surface (names + signal flags + lifecycle + dep names), renderer output contains expected idioms (provider mocks, signal-aware `setInput`, `it()` count = case count).
- **Public API additions** in `packages/core/src/index.ts`: `TestPlanAnalyzer`, `NoComponentFoundError`, `AnalyzeOptions`, `parseComponentSurface`, `parseComponentSurfaceFromText`, `ParsedComponentSurface`, `SYSTEM_PROMPT`, `formatUserPrompt`, `renderTestPlan`. Documented as Node-only (excludes from browser bundles via `core/src/analyze/test-plan/parser.ts` importing `ts-morph`).
- **Dep added:** `ts-morph` for Angular source parsing.

## Changed

- **`docs/07-build-plan.md` M2 status:** all task boxes ticked. Done-when explicitly notes that live-Jest-against-real-Angular verification is deferred to M3.
- **`docs/07-build-plan.md` M3 scope:** added a task to bootstrap the Angular 20 fixture app + run the rendered specs through Jest. M3 done-when extended to include "`npx jest` against the rendered specs returns green." Closes the deferred M2 e2e verification while doing M3's CLI integration anyway.
- **`docs/99-open-questions.md`:** new entry "M2 e2e: live Jest verification against a sample Angular 20 app" tracking the deferral with M3 as the resolution trigger.

## Fixed

- (n/a)

## Files Changed

| File | Change |
| ---- | ------ |
| `packages/core/package.json` | Changed — added `ts-morph` dependency |
| `packages/core/src/index.ts` | Changed — exports for analyzer, parser, prompt helpers, renderer |
| `packages/core/src/analyze/test-plan/parser.ts` | New — ts-morph-based component surface extractor |
| `packages/core/src/analyze/test-plan/prompt.ts` | New — system + user prompt construction |
| `packages/core/src/analyze/test-plan/analyzer.ts` | New — `TestPlanAnalyzer` end-to-end |
| `packages/core/src/render/test/renderer.ts` | New — `TestPlan` → Jest `.spec.ts` source |
| `packages/core/tests/analyze/test-plan/parser.test.ts` | New — 16 parser unit tests |
| `packages/core/tests/render/test/renderer.test.ts` | New — 15 renderer golden tests |
| `packages/core/tests/integration/test-plan.integration.test.ts` | New — 18 parser+renderer round-trip tests against fixtures |
| `packages/core/tests/fixtures/components/greeter.component.ts` | New — presentational fixture |
| `packages/core/tests/fixtures/components/user-list.component.ts` | New — service-injecting fixture |
| `packages/core/tests/fixtures/components/signal-counter.component.ts` | New — signal-API fixture |
| `packages/core/tests/fixtures/test-plans/greeter.json` | New — hand-authored plan |
| `packages/core/tests/fixtures/test-plans/user-list.json` | New — hand-authored plan |
| `packages/core/tests/fixtures/test-plans/signal-counter.json` | New — hand-authored plan |
| `docs/07-build-plan.md` | Changed — M2 ticked + done-when narrowed; M3 scope expanded |
| `docs/99-open-questions.md` | Changed — added "M2 e2e: live Jest verification" entry |
| `pnpm-lock.yaml` | Changed — `ts-morph` resolution |
| `Versions/v0/v0.3.0/release-notes.md` | New — this file |
