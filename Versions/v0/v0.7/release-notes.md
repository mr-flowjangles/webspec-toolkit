# v0.7

## v0.7.5 — Version Folder Consolidation (2026-05-13)

### Problem

Through v0.7.4 the versioning convention created one folder per patch under `Versions/v{major}/v{major}.{minor}.{patch}/`. After 31 patches across v0.0 through v0.7, the `Versions/v0/` tree had 31 sibling folders — each holding a single `release-notes.md`. Navigating release history meant opening 31 separate files, and the per-patch folder was empty ceremony: nothing else ever lived inside it. Rob flagged "we just create a lot of folders" — the structure had more friction than signal.

A common changelog convention (Keep-a-Changelog, most OSS projects) is one file containing all versions, newest-at-top. The full-history-in-one-file shape is too coarse for a project still actively building — v0 alone would be 1500+ lines. The natural middle ground is one stacked file per **minor**: collocates related patches (e.g. all of M6's v0.7.x work in one place), keeps each file scannable, and reduces folder count by 4x.

### Solution

**Folder shape.** `Versions/v{major}/v{major}.{minor}/release-notes.md`. Each minor's file is a stacked changelog with newest patch at the top:

```
# v0.7

## v0.7.5 — Version Folder Consolidation (2026-05-13)
### Problem / ### Solution / …

## v0.7.4 — M6 Amplification Pass Golden (2026-05-13)
### Problem / ### Solution / …

## v0.7.3 — M6 Integration Test (2026-05-12)
…
```

H1 is the minor version. Each patch is an H2 with version + title + date in parens, mirroring the H1 the old convention used. Section headers (Problem / Solution / etc.) demote one level to H3.

**Backfill.** All 31 existing per-patch folders consolidated into 8 minor files (v0.0 through v0.7). A one-off awk-based consolidator handled the heading demotion in a single pass (deepest first to avoid cascading) and respected fenced code blocks (e.g. `# A11y Report` lines inside example output in v0.3.5 stayed as H1 inside the fence, not demoted to H2). Newest-at-top ordering verified across all 8 files. The 31 old folders were `rm -rf`'d.

**Script rewrite.** `scripts/new-version.sh` now:
1. Detects the latest version by scanning H2 headings (`## v{maj}.{min}.{pat} …`) across `Versions/v*/v*/release-notes.md` rather than reading folder names. The scan is fence-aware — `## v…` lines inside ` ``` ` code blocks (e.g. example markdown documenting the convention itself, like this PR's release notes) are skipped so they can't be mistaken for shipped versions.
2. **Patch bump** → prepends a new H2 stub at the top of the existing minor's file (just under the H1) via an awk insertion at the first H2 marker.
3. **Minor or major bump** → creates a new `Versions/v{major}/v{major}.{minor}/` folder with a fresh `release-notes.md` containing the H1 + first H2 stub.

Dirty-tree guard, branch creation (`V{maj}dot{min}dot{pat}/{Description}`), and `--dry-run` mode are unchanged. All three dry-run modes verified — patch correctly prepends, minor correctly creates v0.8, major correctly creates v1/v1.0.

**Docs.** `CLAUDE.md`'s versioning section rewritten to describe the new shape: example tree, file structure, what the script does on each bump, and the PR-title rule updated from "H1 in release-notes.md" to "H2 heading in the minor's release-notes.md."

**Follow-up.** The `bellese-version-pr` skill in the `bellese-claude-toolkit` plugin repo still documents the old per-patch shape. Deferred to a follow-up PR in that repo (tracked outside this commit).

### New

- 8 consolidated `Versions/v0/v0.{0..7}/release-notes.md` files. 31 patches' history preserved verbatim under stacked H2 entries.

### Changed

- `scripts/new-version.sh` — rewritten for per-minor folder shape: scans H2s to find latest version; prepends on patch, creates on minor/major.
- `CLAUDE.md` — versioning section updated (tree, stacked-file structure, script behavior, PR-title rule).

### Fixed

_None — convention refactor + script rewrite._

### Files Changed

| File | Change |
|------|--------|
| `Versions/v0/v0.0/release-notes.md` through `v0.7/release-notes.md` | New — 8 stacked changelogs (newest patch at top). |
| `Versions/v0/v0.0.0/release-notes.md` through `v0.7.4/release-notes.md` | Deleted — 31 per-patch folders retired. Content preserved verbatim in the consolidated files. |
| `scripts/new-version.sh` | Rewritten — append-vs-create logic; H2-scan for latest version. |
| `CLAUDE.md` | Versioning section rewritten; PR-title rule updated. |

## v0.7.4 — M6 Amplification Pass Golden (2026-05-13)

### Problem

The M6 build-plan box at `docs/07-build-plan.md:144` asked for a golden test of "the amplification pass against a recorded-LLM-response fixture (deterministic test of 'given this recording + this LLM response, render this spec')." Reading that as written, it describes a single end-to-end golden: `WorkflowRecording` in → fake LLM stand-in returns a canned `AmplifiedRecording` → `renderAmplifiedPlaywrightSpec` → snapshot the `.spec.ts`.

What we actually had through v0.7.3 was two half-goldens — `tests/analyze/amplify/analyzer.test.ts` pinned the analyzer with a fake provider, `tests/render/e2e/amplified.test.ts` pinned the IR-to-source renderer with hand-written fixtures — but nothing wired them together. That coverage is logically sufficient (each half is pinned, so the composition is determined), but it's not what the box says, and a regression in how the analyzer's output shape meets the renderer's input expectations could slip past both half-goldens.

The same audit surfaced two stale checkboxes in the build plan that no longer reflected reality:

- M4's `A11yAnalyzer` (browser mode) box was unticked but had a note saying it had been folded into M5. The work actually shipped in v0.3.8 as part of content-script axe injection.
- M5's `webRequest` outgoing-request capture box was deferred to "M6-enables" — the decision was "let the renderer decide whether it needs network metadata before we pay for capture." M6 is now far enough along to answer: the deterministic renderer and the amplifier both ignore `WorkflowRecording.network`, and `docs/06-renderer.md:150` explicitly puts recorded-network mocking out of v1. The schema field stays as a forward-compat seam.

### Solution

**End-to-end golden.** `packages/core/tests/render/e2e/amplification-pass.test.ts` composes both halves:

1. A small hand-written `WorkflowRecording` — login flow with email input, password input, sign-in click.
2. A canned `AmplifiedRecording` standing in for the LLM's response — the recorded happy scenario plus one negative variant (empty password).
3. `AmplifyAnalyzer` instantiated with a fake `LLMProvider` (same `vi.fn` pattern as the existing analyzer tests) that returns the canned response.
4. The analyzer's output flows into `renderAmplifiedPlaywrightSpec`, and the result is pinned with `toMatchInlineSnapshot` — same style as the existing renderer goldens.

The snapshot captures two `test()` blocks with role-based locators, description comments, the visibility assertion on the happy path, and the `toContainText` assertion on the negative — exactly the shape a v1 Playwright spec should have. A regression in either the analyzer's plumbing or the renderer's source emission, or in how their boundary types line up, breaks this snapshot.

A second assertion verifies that the recording flows through to the LLM call without mutation (the user message contains `user@example.com`, `Sign in`, and the start URL verbatim).

**Build-plan housekeeping.** Two stale checkboxes resolved against current reality:

- M4 browser-mode `A11yAnalyzer` ticked with a v0.3.8 annotation.
- M5 `webRequest` capture struck through with an out-of-v1 note explaining the M6 audit that retired it.

### New

- `packages/core/tests/render/e2e/amplification-pass.test.ts` — end-to-end golden for the M6 amplification pass. Two tests (snapshot of the rendered spec; provider-input verification), 186 → 188 total tests passing.

### Changed

- `docs/07-build-plan.md` — three closures: M4 browser-mode box ticked with v0.3.8 annotation; M5 webRequest box struck through with out-of-v1 note; M6 amplification-pass-golden box ticked with this PR's annotation.

### Fixed

_None — pure addition + doc housekeeping._

### Files Changed

| File | Change |
|------|--------|
| `packages/core/tests/render/e2e/amplification-pass.test.ts` | New — end-to-end golden composing analyzer + renderer. |
| `docs/07-build-plan.md` | M4 browser-mode box ticked, M5 webRequest box struck through, M6 amplification-pass-golden box ticked. |
| `Versions/v0/v0.7.4/release-notes.md` | This file. |

### What's next

M6's checkbox state after this PR: six of seven sub-bullets ticked. The remaining ones at the v1 DoD level (live Bedrock amplifier run; recorder→render parity on three deployed sites; README quickstart pass) aren't M6 sub-bullets — they're the v1 DoD items that gate `v1.0.0`. A future minor bump declares M6 itself done; the patch sequence likely closes the three DoD items first.

## v0.7.3 — M6 Integration Test (2026-05-12)

### Problem

By v0.7.2 the pipeline was code-complete on paper: a captured `WorkflowRecording` flows through the deterministic renderer (v0.7.0) or the LLM amplifier (v0.7.2) into a Playwright `.spec.ts`. The 232 unit and golden tests covered every action, every selector strategy, every navigate reason, every schema constraint. But nothing in the test suite actually *ran* a rendered spec through Playwright's runner against a real browser. The full loop — recording → render → run → pass — had never been closed end-to-end.

`docs/06-renderer.md` named the missing piece: a hermetic local fixture under `tests/fixtures/playwright-target/`, a recording of a user flow on it, and an integration test that renders the recording and watches the rendered spec execute. That's v0.7.3.

### Solution

Three pieces:

**Fixture.** `tests/fixtures/playwright-target/form.html` — a single signup-style HTML page with an email input, a country dropdown, a subscribe checkbox, a submit button, and a hidden success message that appears after `submit`. ~30 lines. Self-contained: no build, no server, no network. Loaded by the rendered spec via `file://`. Covers `input` (fill), `change` on `<select>` (selectOption), `change` on checkbox (check), `click`, and post-action visibility — five of the deterministic mapping rows in one fixture.

**Recording.** Hand-built in TypeScript inside the integration test itself. The fixture lives at an absolute path on disk; the recording's `startUrl` is `file://${absolutePath}` resolved at test time. Selector hardening produces `role=textbox[name="Email"]`, `role=combobox[name="Country"]`, etc. — same shape the real recorder would emit on this HTML.

**Integration test.** `packages/cli/tests/integration/render-and-run.integration.test.ts`:

1. Builds the `WorkflowRecording` in memory.
2. Calls `renderPlaywrightSpec(recording)` — exercises the v0.7.0 deterministic path.
3. Writes the rendered spec to a gitignored `.tmp/` directory under the integration-test folder (so `@playwright/test` resolves from `packages/cli/node_modules`).
4. Spawns `npx playwright test --config <inline-config> <rendered-spec>` — the actual Playwright test runner, headless Chromium, real browser.
5. Asserts exit code 0. On failure, surfaces the runner's stdout/stderr so the cause is debuggable rather than just an exit-code mismatch.

Runs in ~1.7s on the warm path (after Chromium's been downloaded). The cold path requires a one-time `npx playwright install chromium` (~90 MB). No mocking — the rendered spec is the actual artifact the CLI would emit; Playwright is the actual runner the user would use.

### New

- `tests/fixtures/playwright-target/form.html` — minimal signup form fixture. Email input + country select + subscribe checkbox + submit button + success message.
- `packages/cli/tests/integration/render-and-run.integration.test.ts` — vitest integration test that drives the full pipeline and shells out to Playwright.

### Changed

- `packages/cli/package.json` — add `@playwright/test` (^1.60.0) as a devDependency.
- `pnpm-lock.yaml` — locked Playwright + its dependency closure.
- `.gitignore` — ignore Playwright's `test-results/`, `playwright-report/`, and the integration test's per-run `.tmp/` directory.

### Files Changed

| File | Change |
|------|--------|
| `tests/fixtures/playwright-target/form.html` | New — hermetic HTML fixture covering input / select / checkbox / submit. |
| `packages/cli/tests/integration/render-and-run.integration.test.ts` | New — full-loop integration test (render → spawn Playwright → assert exit 0). |
| `packages/cli/package.json` | Add `@playwright/test` devDependency. |
| `pnpm-lock.yaml` | Lock the Playwright dependency closure. |
| `.gitignore` | Ignore Playwright runner artifacts and the per-run integration `.tmp/`. |
| `Versions/v0/v0.7.3/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **233/233** tests pass (232 prior + 1 new integration test). The integration test runs by default — no opt-in flag — and takes ~1.7s on a warm Chromium install. Type-check clean. Vite bundle clean.

#### What this proves

Before v0.7.3, the pipeline's correctness relied on three independent sources of evidence:

1. Schema validation tests for every IR shape.
2. Golden tests for the deterministic renderer (24) + amplified renderer (10).
3. Manual three-site smoke at v0.6.0 (recorder + audit).

Each of those left the same gap: do the strings we emit actually compile, launch a browser, navigate to the recorded URL, perform the recorded actions, and exit cleanly? v0.7.3 answers yes, with a real Chromium process, real `await page.fill()` calls, and a real form submit.

#### First-time setup

If `npx playwright install chromium` hasn't been run on a machine, the integration test fails with Playwright's own clear message ("Please install browsers..."). One-line fix. No code change. CI integration is deferred — the test runs locally as part of the regular suite.

### What's next

M6 is **functionally complete**. v1 DoD outstanding items:

- **Live amplifier verification on AWS Bedrock.** The amplifier code path is goldenable but hasn't fired against a real model yet. Lands the day AWS credentials are wired.
- **Recorder → render parity on three real deployed sites.** v0.6.0 verified audit parity on three sites; the renderer half of that verification (record on each, render, run) wasn't done because the renderer didn't exist yet. Now it does.
- **README quickstart** that walks an unfamiliar reader from "clone the repo" to "first rendered spec." Drafted but stale — needs an update against the current CLI surface.

When those are checked, the next bump is `v1.0.0` — the v1 Definition of Done at the top of `docs/07-build-plan.md`.

## v0.7.2 — LLM Amplifier (2026-05-12)

### Problem

v0.7.0 closed the deterministic loop (recording → Playwright spec) and v0.7.1 landed the `AmplifiedRecording` IR. What was still missing: the LLM that *produces* the amplified IR from a captured `WorkflowRecording`. Without it, the IR has no producer and the v1 differentiator (negative scenarios alongside the recorded happy path) doesn't exist.

The four planning decisions from the walk-through:

1. **Input**: the LLM sees the full `WorkflowRecording` JSON (events + selectors + navigation + start URL). Not just the events array; not DOM snapshots.
2. **Constraint**: a fixed list of plausible negative archetypes in the system prompt, with explicit instructions to pick only the 2–4 most applicable.
3. **Volume**: 1 happy + 2–4 negatives = ~3–5 scenarios per recording. No hard ceiling enforced in code.
4. **Caching**: standard M1 pattern — system prompt cached via the adapter, user prompt (recording JSON) varies per call. Structured output via `tools` + `tool_choice` over `AmplifiedRecordingSchema`.

### Solution

Three pieces in `@webspec/core`, plus a `--provider` flag on the CLI:

**`SYSTEM_PROMPT` and `formatUserPrompt`** in `packages/core/src/analyze/amplify/prompt.ts`. The system prompt frames the model as a Playwright test author, enumerates the action/assertion sets the IR allows, maps each `RecordedEvent` kind (and each `navigate.reason`) to a target action, lists the five negative archetypes with explicit "pick 2–4 most plausible — skip ones that don't apply," and explicitly forbids fabricated selectors and happy-scenario drift. The user prompt is the `WorkflowRecording` stringified inside a fenced JSON block.

**`AmplifyAnalyzer`** in `packages/core/src/analyze/amplify/analyzer.ts`. Constructor takes an `LLMProvider`. The single `amplify(recording)` method calls `llm.complete({ system, messages, schema: AmplifiedRecordingSchema, schemaName: 'AmplifiedRecording' })` and returns the validated result. Zod validation lives in the adapter (same gate the M2 TestPlan analyzer uses); a drift between the LLM's output and the schema bubbles as `LLMValidationError` rather than emitting a broken spec.

**CLI integration.** `webspec record-to-spec` gains a `--provider <name>` flag. Valid values for v1: `bedrock`. When set, the deterministic pass is replaced — the CLI constructs a `BedrockAdapter`, calls `AmplifyAnalyzer.amplify`, and renders the result with `renderAmplifiedPlaywrightSpec` (the v0.7.1 renderer that emits one `test()` block per scenario). Without `--provider`, behavior is unchanged from v0.7.0 — same deterministic happy-path spec.

**Tests use a fake `LLMProvider`** (vitest mock) so the suite runs with zero AWS dependency. Live Bedrock verification is gated on AWS credentials being set up and lives outside this suite; the day those land, the amplifier works end-to-end without further code changes.

### New

- `packages/core/src/analyze/amplify/prompt.ts` — `SYSTEM_PROMPT` (cacheable) + `formatUserPrompt(recording)`.
- `packages/core/src/analyze/amplify/analyzer.ts` — `AmplifyAnalyzer` class.
- `packages/core/tests/analyze/amplify/prompt.test.ts` — 7 tests asserting load-bearing instructions are present (frames the model, lists archetypes, enumerates action/assertion kinds, forbids drift, maps every `navigate.reason`, embeds recording JSON in the user prompt).
- `packages/core/tests/analyze/amplify/analyzer.test.ts` — 4 tests covering the analyzer with a fake provider (returns validated response, passes recording through, requests `AmplifiedRecordingSchema` validation, propagates provider errors).
- `--provider <name>` flag on `webspec record-to-spec`. 3 new arg-parser tests (accepts `bedrock`, rejects unknown value, rejects missing value).

### Changed

- `packages/core/src/index.ts` — export `AmplifyAnalyzer` plus the prompt builders (renamed to `AMPLIFY_SYSTEM_PROMPT` / `formatAmplifyUserPrompt` to avoid colliding with the M2 TestPlan prompt symbols).
- `packages/cli/src/args.ts` — extend `RecordToSpecCommand` with optional `provider: 'bedrock'`. `parseRecordToSpec` validates `--provider` against a small allowlist; updates the help text to mention amplified mode.
- `packages/cli/src/commands/record-to-spec.ts` — when `cmd.provider` is set, construct the matching `LLMProvider`, run the analyzer, render with `renderAmplifiedPlaywrightSpec`. Otherwise the v0.7.0 deterministic path. `RecordToSpecResult` gains `scenarioCount` and `amplified` flag.
- `packages/cli/src/index.ts` — stderr log now mentions `(amplified, N scenarios)` when amplified.

### Files Changed

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

### Verification

`pnpm -w test` green: **232/232** tests pass (218 prior + 14 new — 11 amplifier + 3 arg-parser). Type-check clean across `core` and `cli`. CLI build clean.

#### Deterministic-path smoke (unchanged)

```sh
$ node packages/cli/dist/index.js record-to-spec /tmp/select-recording.json --out /tmp/smoke.spec.ts
webspec record-to-spec: rendered 3 events → /tmp/smoke.spec.ts
```

Output identical to v0.7.0. No regression.

#### Amplified-path smoke (deferred — needs AWS creds)

```sh
$ node packages/cli/dist/index.js record-to-spec recording.json --provider bedrock
webspec record-to-spec: rendered N events (amplified, M scenarios) → recording.spec.ts
```

The amplified path's unit-test coverage (analyzer with fake provider) is complete; live verification is gated on AWS access. The day those credentials land, this command runs end-to-end without further code changes.

### What's next

- **v0.7.3** — Integration test against a local fixture. Hand-written HTML under `tests/fixtures/playwright-target/`, a hand-written `WorkflowRecording` JSON of the user flow on it, render via `webspec record-to-spec`, run the emitted spec through `@playwright/test`, assert it passes. Closes the "spec compiles and actually executes" gap.
- **v1.0.0** — M6 done = v1 done. The remaining v1 DoD items get checked off (README quickstart, recorder-render parity verified on the three-site smoke).

## v0.7.1 — Amplified Recording IR (2026-05-12)

### Problem

v0.7.0 closed the M5→M6 loop for the deterministic case — capture a `WorkflowRecording`, render a single `test()` block, done. The amplification path (v1's differentiator: negative scenarios generated by the LLM) needs a typed intermediate between the LLM call and the renderer. `docs/06-renderer.md` sketched `AmplifiedRecording` but didn't land the zod schema, the inferred TypeScript types, or a renderer that can consume it. Without those, v0.7.2's LLM call has nothing to validate its output against and nowhere to send it.

### Solution

Three pieces, no LLM in the loop yet:

**Schema.** `AmplifiedRecording`, `AmplifiedScenario`, `AmplifiedAction`, `AmplifiedAssertion` land as zod schemas in `packages/core/src/types/analysis.ts`, alongside `WorkflowRecording`. Not a fourth `Analysis` variant — it's the intermediate the amplifier produces and the renderer consumes; user-facing artifacts stay `WorkflowRecording` (capture) and the rendered `.spec.ts` (output).

Action set matches the deterministic mapping locked in `06-renderer.md`: nine kinds covering the six base Playwright actions (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`) plus three derived-from-`change` primitives (`selectOption`, `check`, `uncheck`). Assertion set has seven kinds (`visible`, `hidden`, `text` with `equals`/`contains` mode, `url`, `count`, `value`, `checked`). Each `AmplifiedScenario` is `kind: 'happy' | 'negative'` with a required `name`, optional `description`, plus `actions[]` and `assertions[]`. The arrays are intentionally separate: actions run first, then assertions. Mid-flow assertions aren't expressible in v1; most negative scenarios fit "do actions, assert end state" cleanly and adding a unified `steps[]` array is a future schema bump if a real case forces it.

**Renderer.** `renderAmplifiedPlaywrightSpec(amplified)` joins `renderPlaywrightSpec` in `packages/core/src/render/e2e/renderer.ts`. Emits one Playwright `test()` block per scenario; optional `description` rides above the test as a single-line `//` comment (multi-line descriptions get newline-preserved comments). Shares the `locator()` and `quote()` helpers with the v0.7.0 deterministic renderer — no duplication of selector translation or string-quoting logic. Action and assertion rendering each get their own dispatch function (`renderAction`, `renderAssertion`) with TypeScript exhaustiveness checks on the discriminated unions.

**Tests.** 29 schema-validation tests (every action kind, every assertion kind, scenario constraints, top-level recording constraints, negative cases like empty names / unknown kinds / negative counts / non-integer counts) plus 10 renderer golden tests (scaffold, every action, every assertion, a happy+negative pair fixture that asserts test-block ordering and non-interleaving).

### New

- `AmplifiedActionSchema`, `AmplifiedAssertionSchema`, `AmplifiedScenarioSchema`, `AmplifiedRecordingSchema` in `packages/core/src/types/analysis.ts`; matching inferred TypeScript types (`AmplifiedAction`, `AmplifiedAssertion`, `AmplifiedScenario`, `AmplifiedRecording`).
- `renderAmplifiedPlaywrightSpec(amplified)` in `packages/core/src/render/e2e/renderer.ts` plus internal `renderAction` / `renderAssertion` helpers.
- `packages/core/tests/types/amplified-recording.test.ts` — 29 schema-validation tests across four describe blocks (action, assertion, scenario, top-level recording).
- `packages/core/tests/render/e2e/amplified.test.ts` — 10 renderer golden tests across four describe blocks (scaffold + actions + assertions + happy/negative pair).

### Changed

- `packages/core/src/index.ts` — export `renderAmplifiedPlaywrightSpec`. (The new types are already re-exported via `export * from './types/analysis.js'`.)
- `packages/core/src/browser.ts` — same export, for the Chrome bundle.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add `AmplifiedRecording` + nested action/assertion/scenario schemas and inferred types. |
| `packages/core/src/render/e2e/renderer.ts` | Add `renderAmplifiedPlaywrightSpec` + `renderAction` / `renderAssertion` dispatchers; share locator + quote helpers with the v0.7.0 deterministic renderer. |
| `packages/core/src/index.ts` | Export the new renderer. |
| `packages/core/src/browser.ts` | Export the new renderer in the browser bundle. |
| `packages/core/tests/types/amplified-recording.test.ts` | New — 29 zod-validation tests for the IR. |
| `packages/core/tests/render/e2e/amplified.test.ts` | New — 10 renderer golden tests with happy/negative pair fixture. |
| `Versions/v0/v0.7.1/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **218/218** tests pass (179 prior + 39 new). Type-check clean (`tsc -b` across `core`).

### What's next

- **v0.7.2** — Wire the LLM amplifier. New analyzer in `packages/core/src/analyze/amplify/` that takes a `WorkflowRecording` plus an `LLMProvider`, prompts for negative scenarios, validates the response against `AmplifiedRecordingSchema`, returns the typed result. CLI: `webspec record-to-spec --provider X` switches to the amplified path. Skipped when no provider is configured — deterministic spec emits alone.
- **v0.7.3** — Integration test against `tests/fixtures/playwright-target/`. Spec compiles and the happy-path test passes via the Playwright runner.
- **v1.0.0** — M6 done = v1 done.

## v0.7.0 — M6 Deterministic Renderer (2026-05-12)

### Problem

M5 closed with a recorder that produces typed `WorkflowRecording` JSON files — hardened selectors, dedup, navigation events, session persistence, all in. But the recordings were dead-ends. There was no way to turn a `recording.json` into a runnable test. M6 exists to close that loop: capture a workflow once, render a Playwright spec from it.

The design doc (`docs/06-renderer.md`, v0.6.2) settled the contract: deterministic pass first, LLM amplification later (v0.7.2), structured `AmplifiedRecording` IR in between. v0.7.0 ships the first piece — the deterministic pass — so the loop closes end-to-end even when no LLM is configured.

### Solution

Three pieces, all in this version:

**`renderPlaywrightSpec(recording, opts?)`** — a pure `WorkflowRecording → string` function in `packages/core/src/render/e2e/renderer.ts`. Browser-safe (string ops only; no Node deps). Mapping is exactly what `06-renderer.md` locked:

| Recorder event | Playwright |
|---|---|
| start (every recording) | `page.goto(startUrl)` |
| `click` | `locator.click()` |
| `input` | `locator.fill(value)` |
| `keydown` (with selector) | `locator.press(key)` |
| `keydown` (without selector) | `page.keyboard.press(key)` |
| `change` on checkbox/radio (`value: 'true'`) | `locator.check()` |
| `change` on checkbox/radio (`value: 'false'`) | `locator.uncheck()` |
| `change` on `<select>` (carries `options`) | `locator.selectOption(value)` |
| `submit` | `// form submit observed on <selector>` (Playwright has no submit primitive; the preceding click/keydown already triggered it) |
| `navigate` reason `reload` | `page.reload()` |
| `navigate` reason `navigate` | `page.waitForURL(url)` |
| `navigate` reason `history` / `hash` | `await expect(page).toHaveURL(url)` |

Locator translation matches Playwright Codegen's idiom: `role=button[name="Save"]` becomes `page.getByRole('button', { name: 'Save' })`, `text="Sign in"` becomes `page.getByText('Sign in')`, `[data-testid="x"]` becomes `page.getByTestId('x')`. Everything else falls back to `page.locator(rawSelector)`. The v0.5.1 `>> nth=N` disambiguator is stripped from the selector and chained as `.nth(N)` on the locator. String literals quote with single quotes when the value is plain ASCII without specials; fall back to `JSON.stringify` otherwise so escapes are correct.

**`webspec record-to-spec <recording.json>` CLI command** — `packages/cli/src/commands/record-to-spec.ts`. Reads the file, validates against `WorkflowRecordingSchema` (zod), renders, writes the spec next to the input by default (`recording.json` → `recording.spec.ts`) or to `--out` if given. `--test-name` overrides the default `test()` title. Validation failure returns exit 2 (caller-side); FS / runtime errors return exit 1.

**Golden tests** — 24 in `packages/core/tests/render/e2e/renderer.test.ts` covering every locator strategy, every event kind, every `navigate.reason`, string-quoting edge cases (single quotes, newlines), and a full TodoMVC-shaped fixture. 8 more in `packages/cli/tests/args.test.ts` for the new command's argument parser. 179/179 tests pass workspace-wide.

### New

- `packages/core/src/render/e2e/renderer.ts` — `renderPlaywrightSpec(recording: WorkflowRecording, opts?: RenderE2EOptions): string` plus internal helpers (`renderEvent`, `renderChange`, `renderNavigate`, `locator`, `baseExpr`, `splitNth`, `quote`).
- `packages/cli/src/commands/record-to-spec.ts` — `runRecordToSpec(cmd)` + `RecordToSpecInputError` for caller-side validation failures.
- `packages/cli/tests/args.test.ts` — 8 tests for the `record-to-spec` argument parser.
- `packages/core/tests/render/e2e/renderer.test.ts` — 24 golden tests across 5 describe blocks (header & scaffold, locator strategies, actions, navigation reasons, string quoting) plus a full fixture covering an in-order TodoMVC walkthrough.

### Changed

- `packages/core/src/index.ts` — export `renderPlaywrightSpec` and `RenderE2EOptions` from the Node entry point.
- `packages/core/src/browser.ts` — same exports for the Chrome bundle.
- `packages/cli/src/args.ts` — `ParsedArgs` widened with `RecordToSpecCommand`; new `parseRecordToSpec` sub-parser. Help text updated to document the new command + `--test-name` flag.
- `packages/cli/src/index.ts` — dispatch the new `'record-to-spec'` case; map `RecordToSpecInputError` to exit 2.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/e2e/renderer.ts` | New — deterministic renderer (`WorkflowRecording` → Playwright `.spec.ts` source). |
| `packages/core/tests/render/e2e/renderer.test.ts` | New — 24 golden tests covering the full event/strategy/reason matrix. |
| `packages/core/src/index.ts` | Export `renderPlaywrightSpec` + `RenderE2EOptions`. |
| `packages/core/src/browser.ts` | Same, for the browser bundle. |
| `packages/cli/src/commands/record-to-spec.ts` | New — `webspec record-to-spec` implementation with zod validation gate. |
| `packages/cli/src/args.ts` | Parse `record-to-spec` subcommand; extend `HELP_TEXT`. |
| `packages/cli/src/index.ts` | Dispatch the new subcommand; map input errors to exit 2. |
| `packages/cli/tests/args.test.ts` | 8 new tests for the `record-to-spec` arg parser. |
| `Versions/v0/v0.7.0/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **179/179** tests pass (147 prior + 24 e2e renderer + 8 record-to-spec arg-parser). Type-check clean across `core` and `cli`. CLI builds clean.

#### End-to-end smoke

Two real-recording smokes pass:

**Select recording (v0.6.1 verification artifact).** A 3-event recording of three dropdown selections renders to:

```ts
import { expect, test } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('http://localhost:8765/select-test.html');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('ca');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('mx');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('us');
});
```

**Synthetic login + nav fixture.** A 7-event recording covering fill (with masked password), click, all three navigation reasons, and a hash-routing assertion renders to:

```ts
import { expect, test } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('https://example.com/dashboard');
  await page.reload();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('https://example.com/dashboard/#/settings');
});
```

**Bad-input rejection.** `webspec record-to-spec` against a file that's valid JSON but not a `WorkflowRecording` exits with code 2 and prints the zod validation error pointing at the missing fields.

### What's next

- **v0.7.1** — Define the `AmplifiedRecording` zod schema in `@webspec/core` (`scenarios[]` with typed `actions[]` + `assertions[]`). No LLM yet; just the IR and zod validation, plus a hand-written golden fixture.
- **v0.7.2** — Wire the LLM amplifier. Prompt + Bedrock call + validated response → renderer extension that emits the negative scenarios as additional `test()` blocks.
- **v0.7.3** — Integration test. Local fixture under `tests/fixtures/playwright-target/`; spec compiles and the happy-path test passes against the fixture via the Playwright runner.
- **v1.0.0** — M6 done = v1 done.

