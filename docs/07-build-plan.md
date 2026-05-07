# 07 — Build plan

The implementation order is the order in this doc. Milestones are sequential, tasks within a milestone are ordered. **We check the boxes as we go.** When a milestone is fully checked, the next one starts.

If something forces us off this plan (a discovered constraint, a customer arriving early, etc.), we update this doc _first_, then change course. Don't drift silently.

The convention is `## M<N> — {Title}` so `make version-M<N>` can auto-resolve the milestone title from this file.

## v1 — Definition of Done

v1 ships when **all** of the following are true:

- [ ] Docker image builds reproducibly (`make image`) and `bellese-test --help` works in the smoke test.
- [ ] CLI: `bellese-test gen <component.ts>` produces a Jest `.spec.ts` that compiles and runs against a sample Angular 19+ app.
- [ ] CLI: `bellese-test audit <url>` produces a normalized JSON + Markdown a11y report tagged `wcag21aa` + `section508`.
- [ ] CLI: `bellese-test record-to-spec <recording.json>` produces a Playwright `.spec.ts` that runs end-to-end against the same app.
- [ ] Chrome extension: popup has both modes — "Audit this tab" returns axe findings; "Record" captures a workflow and exports a `WorkflowRecording` JSON.
- [ ] VS Code extension: right-click on a `.component.ts` → "Generate Spec" produces the same output as the CLI; sidebar a11y panel runs against `localhost:4200`.
- [ ] LLM access is via AWS Bedrock with standard AWS credentials. The `LLMProvider` interface is provider-agnostic — adding a second adapter (M8) is a code change scoped to one new file plus a config flip; no renderer or surface changes.
- [ ] All milestones below are checked.
- [ ] `README.md` has a quickstart that a new operator can follow end-to-end (gen + audit + record-to-spec).

---

## M0 — Foundations

Goal: project skeleton ready, dev environment wired, no feature code yet.

- [x] Initialize git repo, make initial commit of design docs and scaffold.
- [x] Add root `package.json` and `pnpm-workspace.yaml`; create `packages/{core,cli,vscode-extension,chrome-extension,config}` with stub `package.json` files and `src/index.ts` placeholders.
- [x] Pin Node + pnpm versions in `.nvmrc` / `package.json#packageManager` (Node 20, pnpm 9.12.3).
- [x] Wire `make setup` → `pnpm install`, `make build` → `tsc -b`, `make test` → `vitest run`, `make lint` → `eslint .`, `make format` → `prettier --write .`.
- [x] Add TypeScript project references across packages; root `tsc -b` builds the full graph clean.
- [x] Add ESLint flat config (typescript-eslint) + Prettier at the root; `make lint` and `make format-check` pass on the empty packages.
- [x] Add Vitest at the root with `passWithNoTests`; `make test` passes with no tests yet.
- [x] Verify `make ci` passes.
- [x] Replace the `Dockerfile` stub with a multi-stage Node 20 build (CLI runtime image); `make image` builds and `make smoke` returns the CLI's `--help`.
- [x] Verify versioning ceremony: `./scripts/new-version.sh --dry-run "Smoke Test"` prints the plan with no side effects; `make version-M0` created the `V0dot1dot0/Foundations` branch and `Versions/v0/v0.1.0/release-notes.md`.

**Done when:** monorepo builds, `make ci` is green, Docker image builds + smoke-tests, versioning ceremony runs cleanly.

---

## M1 — Contract artifact + LLM provider seam

Goal: lock the `Analysis` shape (all three variants: `TestPlan`, `A11yReport`, `WorkflowRecording`) and the `LLMProvider` interface in code; ship one adapter; nothing else.

- [x] Created `packages/core/src/types/analysis.ts` with zod schemas + inferred types for the full `Analysis` discriminated union (3 variants) plus sub-shapes (`TestPlan` w/ `TestCase`/`SurfaceInput`/`SurfaceOutput`/etc., `A11yReport` w/ `Finding`, `WorkflowRecording` w/ `RecordedEvent` discriminated union + `HardenedSelector`/`NetworkRequest`/`ObservedState`).
- [x] Created `packages/core/src/llm/provider.ts` with the vendor-neutral `LLMProvider` interface, `CompletionRequest`, `ChatMessage`, and `LLMValidationError`. Documented the contract — adapters MUST validate against the zod schema before returning.
- [x] Implemented `BedrockAdapter` (`packages/core/src/llm/bedrock.ts`) using `@anthropic-ai/bedrock-sdk` (AWS standard credential chain, no API key), `tools` + `tool_choice` for structured output, zod 4 native `z.toJSONSchema()` for the tool's `input_schema`, adaptive thinking + `effort: 'high'` defaults, system-prompt prompt caching via `cache_control: 'ephemeral'`, injectable `client` for tests. Default model `us.anthropic.claude-opus-4-5-20251101-v1:0` (cross-region inference profile).
- [x] Added `packages/core/tests/llm/bedrock.test.ts` — 12 fixture-based tests covering happy path, request shape (tool_choice forcing, cache_control on system, adaptive+effort defaults, maxTokens override), and failure modes (no tool_use block, mismatched tool name, zod validation failure, transport error pass-through).
- [x] Wrote `docs/02-contract-spec.md` — variant rationale, the `schemaVersion` evolution rule (Buckets A/B/C), why `WorkflowRecording` is LLM-free at capture and LLM-polished only at render time, what the M1 contract test guarantees about the seam.

**Done when:** `Analysis`, `LLMProvider`, and `BedrockAdapter` exist; the contract test passes; `02-contract-spec.md` is written.

---

## M2 — Test generator (Phase 1 + Phase 2 for tests)

Goal: end-to-end test generation for one Angular component shape.

- [ ] Implement `TestPlanAnalyzer` for **Angular 19+ standalone components** using `ts-morph`. Extract: name, selector, inputs (`@Input` and `input()` signal), outputs (`@Output` and `output()`), public methods, lifecycle hooks, injected deps (`inject()` and constructor DI).
- [ ] Build the prompt template; LLM returns a `TestPlan` with `cases[]`.
- [ ] Implement `TestRenderer`: `TestPlan` → Jest `.spec.ts` source string. Cover `TestBed.configureTestingModule({ imports: [...standaloneComponent] })` patterns and `provideRouter` / `provideHttpClient` mocks.
- [ ] Golden-test `TestRenderer` with hand-written `TestPlan` fixtures (no LLM in the loop).
- [ ] Add three end-to-end tests using small example components: simple presentational, service-injecting, signal-based.

**Done when:** generated `.spec.ts` files for the three example components compile and pass when run with Jest in a sample Angular 20 app.

---

## M3 — CLI surface

Goal: validate the contract through the simplest UI before tackling the IDE/browser surfaces. Make onboarding a single command.

- [ ] `packages/cli/`: `bellese-test gen <path>` reads source, runs analysis, writes `.spec.ts` next to the source.
- [ ] `bellese-test audit <url>` is stubbed (returns "M4 not yet implemented" — wired for the contract).
- [ ] `bellese-test init` — onboarding wizard. Detects the Angular project (reads `angular.json` / `package.json`), drops a sane `bellese-test.config.json`, prompts once for LLM provider + key and stores it via OS keychain (`keytar` or equivalent), prints install URLs for the Chrome and VS Code extensions. Idempotent — re-running updates the config in place.
- [ ] Implement `bellese-test.config.json` resolution + Angular-project auto-detection in `packages/config/`.
- [ ] Exit codes: 0 success, 2 user error, 3 LLM/provider error, 4 internal error.
- [ ] Integration test: run the CLI against a sample repo, verify file emitted + Jest passes; separate test for `init` against a fresh Angular project fixture.

**Done when:** `bellese-test init && bellese-test gen <path>` works end-to-end against a sample Angular repo from a fresh checkout.

---

## M4 — A11y analyzer + report renderer

Goal: WCAG 2.1 AA + Section 508 audits running through the same `Analysis` contract.

- [ ] `A11yAnalyzer` (Node mode): wrap `@axe-core/puppeteer`, run with tags `['wcag21aa','section508']`, validate output into `A11yReport`.
- [ ] `ReportRenderer`: emit JSON and Markdown (severity grouping, rule tag column, selector + fix-hint per finding).
- [ ] CLI: implement `bellese-test audit <url>` end-to-end.
- [ ] Tests: snapshot-test the Markdown renderer against a recorded axe result.

**Done when:** `bellese-test audit https://example.com` produces a clean Markdown report with each finding tagged 508 / WCAG / both.

---

## M5 — Chrome extension (the flagship "easy to use" surface)

Goal: ship the only surface non-developers can use. Two modes — runtime a11y audit, and workflow recorder. Front-loaded ahead of the VS Code extension because it's the lowest "easy to use" floor (508 reviewers, QA, designers, PMs all use this).

**Audit mode:**

- [ ] Scaffold Manifest V3 extension; bundle the **browser flavor** of `core` (a11y + recorder + report renderer; no test generator, no Node imports).
- [ ] Content script injects `axe-core` browser build; scans on demand from the popup.
- [ ] Popup React UI renders the `A11yReport`; "Copy report" button copies the Markdown rendering.

**Recorder mode:**

- [ ] Popup gains a "Record" button (start / stop / discard). Recording state survives popup close (chrome.storage.session).
- [ ] Content script captures `click`, `input`, `change`, `submit`, `keydown`, navigation events. Each event is annotated with a `HardenedSelector` computed at capture time (data-testid > role+name > text > css fallback).
- [ ] Background service worker captures outgoing requests via `webRequest` (URL + method only — no response bodies in v1).
- [ ] Sensitive-input masking: any `<input type="password">` value is replaced with a marker; everything else captured raw with a "review before sharing" warning in the export UI.
- [ ] Stop button → presents the trace summary in the popup → "Download recording.json" button writes a `WorkflowRecording` JSON to disk via `chrome.downloads`.
- [ ] No LLM auth in the Chrome extension for v1 — it doesn't call the LLM (a11y is local; recorder is deterministic). Settings UI is limited to recorder behavior (selector strategy, masking rules). LLM-backed Chrome features would require AWS credentials in the browser, which is awkward; defer until concretely needed.

**Verification:**

- [ ] Verify on three deployed Bellese sites: audit parity with CLI; recorder produces a clean trace for each site's golden-path flow (login → primary action → confirmation).

**Done when:** unpacked extension installs in Chrome, both modes work end-to-end on three sites, audit findings match the CLI for the same URLs, recordings export as JSON.

---

## M6 — E2E renderer (`WorkflowRecording` → Playwright `.spec.ts`)

Goal: turn a recording into a runnable Playwright test. Two-pass renderer; LLM polish optional.

- [ ] Implement deterministic pass: each `RecordedEvent` maps to a Playwright action (`page.click(selector)`, `page.fill(selector, value)`, `page.goto(url)`, etc.). Selectors use the recording's hardened forms.
- [ ] Implement LLM-polish pass: given the action trace + observed network calls, the LLM names the test (`describe`/`test` strings), inserts assertions (`expect(page.getByRole('heading', { name: 'Success' })).toBeVisible()`), and proposes selector consolidations where redundant. Polish is no-op if no provider key is configured.
- [ ] Golden-test the deterministic pass with hand-written `WorkflowRecording` fixtures (no LLM in the loop).
- [ ] CLI: implement `bellese-test record-to-spec <recording.json> [--provider X]` end-to-end. Output written next to the recording (`recording.spec.ts`).
- [ ] Integration test: capture a recording (use a fixture, not a live browser) → render → run the emitted Playwright spec against a sample Angular 20 app → spec passes.

**Done when:** a recording exported from M5 produces a Playwright `.spec.ts` that compiles, runs, and passes against the same app the recording was made against.

---

## M7 — VS Code extension

Goal: in-editor surface for two of the three capabilities (test generation in-flow, dev-time a11y). The recorder lives in the Chrome ext only — no live tab in VS Code.

- [ ] Scaffold the extension with `yo code` (or equivalent); set up `vsce package`.
- [ ] AWS settings: optional `aws_region` and `aws_profile` overrides in VS Code settings. No SecretStorage for credentials — AWS auth uses the system's default credential chain (env / `~/.aws/credentials` / IAM role).
- [ ] Command: `Bellese Test: Generate Spec for Active File` → calls `core` → writes `.spec.ts`.
- [ ] Command: `Bellese Test: Run A11y Audit (URL)` → input box for URL → calls `core` → opens a webview panel rendering the `A11yReport`.
- [ ] Command: `Bellese Test: Render Recording to Playwright Spec` → file picker for a `recording.json` → calls `core/render/E2ERenderer` → writes the `.spec.ts` next to the recording.
- [ ] Sidebar panel: most-recent `Analysis` (any variant) + "Re-run" button.
- [ ] Manual test against a sample Angular 20 project. Document the install (VSIX) flow in the project README.

**Done when:** VSIX installs in VS Code, all three commands work end-to-end, keys persist across reloads.

---

## M8 — Second LLM adapter + provider parity test

Goal: prove the `LLMProvider` seam by adding a second adapter alongside `BedrockAdapter`. The specific second provider is decided at this milestone — candidates: a different Bedrock model family (e.g. a Sonnet variant for cheap default + an Opus variant for hard tasks), OpenAI direct (for OSS users without AWS), or another Bedrock-hosted model.

- [ ] Implement the second adapter following the `BedrockAdapter` pattern. Same `LLMProvider` interface. Same zod-validated outputs.
- [ ] Add a parity test: given the same fixture component and prompt, both adapters return a `TestPlan` with the same shape (structural assertion — case count, surface coverage — not exact text). Repeat the parity test for the E2E LLM-polish pass.
- [ ] CLI flag + config option: `--provider <id>` switching between adapters.
- [ ] Document adding a third adapter in `docs/03-llm-provider-interface.md` (created in this milestone).

**Done when:** both adapters produce passing generated tests for the M2 example components AND polished e2e specs for an M5 fixture recording; parity tests are green.

---

<!--
Future milestones to consider when v1 is real:
- M9: Karma + Jasmine emitter (gated on a Bellese-project inventory — see 99-open-questions.md)
- M10: Cypress renderer alongside Playwright
- M11: In-extension recording playback + visual diffing
- M12: Network-response capture and replay (recorded mocks)
- M13: Coverage feedback loop (re-run Jest, feed gaps to a second LLM pass)
- M14: GitHub Action surface
- M15: Optional Bellese LLM proxy
-->
