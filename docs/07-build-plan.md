# 07 — Build plan

The implementation order is the order in this doc. Milestones are sequential, tasks within a milestone are ordered. **We check the boxes as we go.** When a milestone is fully checked, the next one starts.

If something forces us off this plan (a discovered constraint, a customer arriving early, etc.), we update this doc _first_, then change course. Don't drift silently.

The convention is `## M<N> — {Title}` so `make version-M<N>` can auto-resolve the milestone title from this file.

## v1 — Definition of Done

> 🚀 **v1 shipped at `v1.0.0` on 2026-05-14.** Every box below is `[x]` with a footprint of the version it shipped in. The full release announcement is in `Versions/v1/v1.0/release-notes.md`. This section is preserved as a historical record of the v1 contract — don't edit the boxes; if a future version regresses a deliverable, that's a separate fix in a new milestone.

v1 ships a **browser-based shift-left companion**: a Chrome extension that records workflows, generates a test plan with positive + negative scenarios as a runnable Playwright spec, and audits a11y on the live page. v1 ships when **all** of the following are true:

- [x] **Chrome extension installs and runs**, with two modes: ✅ M5 done at v0.6.0.
  - [x] "Audit this tab" returns a normalized 508 / WCAG 2.1 AA report (severity-grouped, rule-tag column, selector + fix-hint per finding). ✅ v0.3.8 (browser-mode injection) + v0.4.0–v0.4.2 (popup UI).
  - [x] "Record" captures a workflow (clicks, input, change, submit, navigation, key events) with hardened selectors, gated by a pre-start naming form that captures a required test name + description. On Stop, the Download button writes both a rendered `.spec.ts` and the raw `WorkflowRecording` JSON via `chrome.downloads`. ✅ v0.5.0–v0.5.4 (capture + JSON export); naming form + spec rendering added in v1.1.0. (Network capture explicitly out of v1 per M5 below; the schema seam remains for the deferred M12.)
- [x] **Recording → Playwright with positive + negative scenarios.** A `WorkflowRecording` (from the Chrome ext or a fixture) renders into a runnable Playwright `.spec.ts`. The test name and description are captured from the user in the popup before recording begins (required fields on the contract) and become the `test()` title and leading comment in the spec. The deterministic pass emits the recorded happy path; the LLM amplification pass adds negative scenarios (invalid input, empty fields, error states, edge variants) and assertion suggestions. LLM polish skipped if no provider is configured — the deterministic happy-path spec still emits. ✅ M6 done at v0.7.4 (deterministic v0.7.0, IR v0.7.1, amplifier v0.7.2, integration test v0.7.3, amplification golden v0.7.4); user-supplied name + description added in v1.1.0.
- [x] **Thin CLI for CI integration**: `webspec audit <url>` and `webspec record-to-spec <recording.json>` work end-to-end. (No `webspec gen` in v1 — see "Out of v1 active path" below.) ✅ `audit` v0.3.5; `record-to-spec` v0.7.0 (deterministic) + v0.7.2 (`--provider` amplified).
- [x] **LLM access via AWS Bedrock** with standard AWS credentials. The `LLMProvider` interface is provider-agnostic; adding a second adapter is a code change scoped to one new file. ✅ M1 at v0.2.0.
- [x] **Verified on three deployed sites** — audit parity between Chrome ext and CLI; recordings render to passing Playwright specs against each site's golden-path flow. ✅ audit-parity v0.6.0 (example.com, react.dev, TodoMVC); render-to-spec v0.7.6 (same three sites, all rendered specs pass against the live URL).
- [x] All milestones below (M4 through M6) are checked. ✅ M4 v0.3.6, M5 v0.6.0, M6 v0.7.4.
- [x] `README.md` has a quickstart that a new operator can follow end-to-end (install Chrome ext → record → audit → render a Playwright spec). ✅ v0.7.7.

### Out of v1 active path (intentional)

- **M2 — TestPlan analyzer + Jest renderer (Angular source → Jest specs).** Shipped in v0.3.0 as foundation; reusable for the workflow→Playwright path's positive/negative scenarios because the `TestPlan` contract artifact has the right shape (`cases[]` with arrange/act/assert). Stays in the codebase. **The CLI surface to use it (M3) is deferred** — unit-test gen from source isn't a shift-left signal in v1.
- **M3 — CLI surface as originally scoped** (`webspec gen` for unit tests, `webspec init` onboarding wizard with Angular auto-detection). Deferred. CLI v1 is reduced to `audit` + `record-to-spec`, both of which ship with their respective milestones (M4, M6).
- **M7 — VS Code extension.** Deferred to post-v1. Browser-first means browser-only in v1.
- **M8 — Second LLM adapter + parity test.** Deferred. The `LLMProvider` seam is proven structurally; adding a second adapter is post-v1 unless a customer-procurement constraint forces it.

### Post-v1 stack (designed in `docs/08-test-library.md`, not yet implemented)

- **v1.2 — Test Library.** Per-test slug folder under `~/Downloads/webspec/<slug>/`, each containing `recording.spec.ts` + `recording.json` + a per-test `playwright.config.ts`. A parent `~/Downloads/webspec/playwright.config.ts` is written-once so `playwright test --ui` discovers every saved test. Naming form gains an optional `runAs` field (captured-but-not-yet-rendered). The extension's review-panel "Download" becomes "Save" (writes the slug folder). New `make run-tests` shortcut launches Playwright UI against the parent config — **that is the library + execution surface; we do not build an in-extension list.**
- **v1.3 — Auth Injection.** `runAs` becomes functional. New `webspec.config.ts` (in the user's repo) defines the auth mode — defaults to header injection (`mode: 'headers'`, ModHeader-equivalent) emitting `context.setExtraHTTPHeaders({ ... })` with `${username}` substituted from `recording.runAs`. Also supports `cookie`, `url`, and `storageState` modes. Secrets via `${env.NAME}` interpolation; never in the recording.
- **v1.4 — Suites.** A new artifact at `~/Downloads/webspec/<suite-slug>/suite.json` with `testSlugs: string[]` renders to one `.spec.ts` with N `test()` blocks wrapped in `test.describe.serial(...)`. Suite creation is a Makefile / CLI action (`make new-suite NAME=… TESTS=…`), not an extension action — keeps the extension a recorder.

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
- [x] Verify versioning ceremony.

**Done when:** monorepo builds, `make ci` is green, Docker image builds + smoke-tests, versioning ceremony runs cleanly. ✅ Shipped in v0.1.0.

---

## M1 — Contract artifact + LLM provider seam

Goal: lock the `Analysis` shape (all three variants: `TestPlan`, `A11yReport`, `WorkflowRecording`) and the `LLMProvider` interface in code; ship one adapter; nothing else.

- [x] `packages/core/src/types/analysis.ts` with zod schemas + inferred types for the full `Analysis` discriminated union.
- [x] `packages/core/src/llm/provider.ts` with the vendor-neutral `LLMProvider` interface.
- [x] `BedrockAdapter` (`packages/core/src/llm/bedrock.ts`) using `@anthropic-ai/bedrock-sdk` (AWS standard credential chain), `tools` + `tool_choice` for structured output, zod 4 native `z.toJSONSchema()`, adaptive thinking + `effort: 'high'` defaults, system-prompt prompt caching.
- [x] `packages/core/tests/llm/bedrock.test.ts` — 12 fixture-based tests.
- [x] `docs/02-contract-spec.md` — variant rationale, schemaVersion evolution rule.

**Done when:** `Analysis`, `LLMProvider`, and `BedrockAdapter` exist; the contract test passes; `02-contract-spec.md` is written. ✅ Shipped in v0.2.0.

---

## M2 — TestPlan analyzer + Jest renderer (foundation, deferred from v1 active path)

Goal: end-to-end TestPlan generation for one Angular component shape. **This work shipped in v0.3.0 and is reusable** — the `TestPlan` contract artifact (with `cases[]` carrying arrange/act/assert) is the natural intermediate shape for workflow-derived positive/negative scenarios in M6. The Angular-specific parser + Jest renderer stay in the codebase as the precedent.

- [x] `TestPlanAnalyzer` for Angular 19+ standalone components using `ts-morph`.
- [x] Prompt template (system prompt cacheable; user prompt per-component).
- [x] `TestRenderer` (pure function `TestPlan → string`).
- [x] Golden tests, parser tests, three-fixture integration test.

**Done when:** code-complete with parser + renderer + golden tests + integration test green. ✅ Shipped in v0.3.0.

**Status for v1:** foundation complete. Not extended further until v1 ships. Live Jest run against a sample Angular app remains deferred — see `docs/99-open-questions.md`. If/when the unit-test path returns post-v1 (e.g. as a save-time watcher), this is where it picks up.

---

## ~~M3 — CLI surface~~ (deferred from v1)

**Status:** Deferred from v1. Original scope was a CLI wrapping unit-test generation (`webspec gen`), an `init` onboarding wizard with Angular auto-detection, and a stubbed `audit` + `record-to-spec`. Without unit-test gen on the v1 active path, the only CLI commands v1 needs are `audit` and `record-to-spec`, which ship with M4 and M6 respectively.

If an external user post-v1 wants a unified CLI surface (`webspec gen`, `webspec init`), this milestone reactivates.

---

## M4 — A11y analyzer + report renderer

Goal: WCAG 2.1 AA + Section 508 audits on a live page, available both in the Chrome extension and as a CLI command for CI gating.

- [x] `A11yAnalyzer` (Node mode): wrap `@axe-core/puppeteer`, run with tags `['wcag21aa','section508']`, validate output into `A11yReport`. ✅ v0.3.3.
- [x] `A11yAnalyzer` (browser mode): inject `axe-core/browser` from the Chrome extension content script; same `A11yReport` shape out. ✅ Folded into M5, shipped in v0.3.8 — the browser-mode wrapper has no callsite outside the extension, so it shipped with content-script injection rather than as a standalone M4 PR.
- [x] `ReportRenderer`: emit JSON and Markdown (severity grouping, rule tag column, selector + fix-hint per finding). The Chrome popup renders its own React/HTML view from the same typed report. ✅ v0.3.4.
- [x] CLI: implement `webspec audit <url>` end-to-end (Node-mode analyzer + Markdown renderer to stdout/file). ✅ v0.3.5.
- [x] Tests: snapshot-test the Markdown renderer against a recorded axe result; snapshot-test the typed `A11yReport` round-trip. ✅ v0.3.4 (renderer) + v0.3.3 (round-trip).

**Done when:** `webspec audit https://example.com` produces a clean Markdown report with each finding tagged 508 / WCAG / both, AND the same analyzer can be loaded into the Chrome extension's browser bundle for M5. ✅ CLI side complete in v0.3.5; browser-mode loading verified during M5. Bonus fix: v0.3.6 widened the WCAG tag filter end-to-end so Level A failures aren't underreported.

---

## M5 — Chrome extension (the v1 flagship surface)

Goal: ship the primary v1 surface. Two modes — runtime a11y audit, and workflow recorder. The dev (or QA, designer, 508 reviewer, PM) drives this; nobody needs to leave Chrome to use it.

**Audit mode:**

- [x] Scaffold Manifest V3 extension; bundle the **browser flavor** of `core` (a11y + recorder + report renderer; no test generator, no Node imports). ✅ v0.3.7.
- [x] Content script injects the browser build of `axe-core`; scans on demand from the popup. ✅ v0.3.8.
- [x] Popup React UI renders the `A11yReport`; "Copy report" button copies the Markdown rendering. ✅ v0.4.0–v0.4.2.

**Recorder mode:**

- [x] Popup gains a "Record" button (start / stop / discard). Recording state survives popup close (chrome.storage.session). ✅ v0.4.1 (skeleton) + v0.5.2 (session persistence) + v0.5.4 (Discard).
- [x] Content script captures `click`, `input`, `change`, `submit`, `keydown`, navigation events. Each event is annotated with a `HardenedSelector` computed at capture time (data-testid > role+name > text > css fallback). ✅ v0.5.0 (DOM events) + v0.5.1 (hardened selectors + dedup) + v0.5.3 (navigation).
- ~~Background service worker captures outgoing requests via `webRequest` (URL + method only — no response bodies in v1).~~ **Out of v1** — M6 confirmed the renderer doesn't consume network metadata (neither the deterministic pass nor the amplifier reference `WorkflowRecording.network`; the extension emits `network: []`). The schema field stays as a forward-compat seam for the deferred network-mocking milestone (M12).
- [x] Sensitive-input masking: any `<input type="password">` value is replaced with a marker; everything else captured raw with a "review before sharing" warning in the export UI. ✅ v0.5.0 (password masking) + v0.5.4 (review warning).
- [x] Pre-start naming form: clicking "Record workflow" reveals a required test-name input + required description textarea + Start button (disabled until both have content). Values thread through `recorder:start` and survive content-script restarts via `chrome.storage.session`. ✅ v1.1.0.
- [x] Stop button → presents the trace summary in the popup → "Download" button writes both `recording-<ts>.spec.ts` (rendered via `renderPlaywrightSpec`) and `recording-<ts>.json` (raw `WorkflowRecording`) to disk via `chrome.downloads`. ✅ v0.5.4 (review panel + JSON download); spec rendering added in v1.1.0.
- [x] No LLM auth in the Chrome extension for v1 — it doesn't call the LLM (a11y is local; recorder is deterministic). LLM amplification happens at render time (M6, in Node). ✅ confirmed.

**Verification:**

- [x] Verify on three deployed sites: audit parity with CLI; recorder produces a clean trace for each site's golden-path flow. ✅ v0.6.0 — example.com (exact parity), react.dev (within tolerance), TodoMVC (expected stateful divergence from prior recordings in localStorage).

**Done when:** unpacked extension installs in Chrome, both modes work end-to-end on three sites, audit findings match the CLI for the same URLs, recordings export as JSON. **✅ M5 done at v0.6.0.**

---

## M6 — E2E renderer (`WorkflowRecording` → Playwright with positive + negative scenarios)

Goal: turn a recording into a runnable Playwright spec **with multiple test cases — the recorded happy path, plus LLM-generated negative scenarios.** Two-pass renderer; deterministic-only is a valid output if no provider is configured.

**Design:** see `docs/06-renderer.md` for the locked action set, assertion set, `navigate.reason` mapping, integration-test target, ambiguous-selector policy, and the `AmplifiedRecording` IR shape. Decisions land at v0.6.2; implementation follows in v0.7.x.

- [x] **Deterministic pass:** each `RecordedEvent` maps to a Playwright action (`page.click(selector)`, `page.fill(selector, value)`, `page.goto(url)`, etc.). Selectors use the recording's hardened forms. Output: one Playwright `test()` block — the recorded happy path. Always works. ✅ v0.7.0.
- [x] **LLM amplification pass** (the v1 differentiator): given the action trace + observed network calls + page state, the LLM:
  - Names the test (`describe` + `test` strings inferred from the workflow).
  - Inserts assertions (e.g. `expect(page.getByRole('heading', { name: 'Success' })).toBeVisible()` after a recorded submit).
  - **Generates negative scenarios** as additional `test()` blocks: empty input, invalid input, malformed input, error-state coverage. Constraints on which negatives to generate are encoded in the prompt — plausible variants only, not exhaustive fuzzing.
  - Proposes selector consolidations where redundant.
  - Skipped if no provider key is configured (deterministic spec emits alone). ✅ v0.7.2.
- [x] **IR decision (resolved at v0.3.2 — Path C):** the LLM emits a typed structured `AmplifiedRecording` (`scenarios[]` with typed `actions` + `assertions`), zod-validated at the seam. A deterministic renderer formats that into Playwright source. Same architectural pattern as M2 (validated structured output → deterministic format). The LLM never writes shipped Playwright code directly. See `99-open-questions.md` for why C beats both "TestPlan reuse" and "LLM-writes-source-directly." ✅ IR shipped in v0.7.1.
- [x] Golden-test the deterministic pass with hand-written `WorkflowRecording` fixtures (no LLM in the loop). ✅ v0.7.0 — `packages/core/tests/render/e2e/renderer.test.ts`.
- [x] Golden-test the amplification pass against a recorded-LLM-response fixture (deterministic test of "given this recording + this LLM response, render this spec"). ✅ v0.7.4 — `packages/core/tests/render/e2e/amplification-pass.test.ts` composes `AmplifyAnalyzer` (with a fake `LLMProvider`) + `renderAmplifiedPlaywrightSpec` and snapshots the resulting source.
- [x] CLI: implement `webspec record-to-spec <recording.json> [--provider X]` end-to-end. Output written next to the recording (`recording.spec.ts`). ✅ v0.7.0 (deterministic) + v0.7.2 (`--provider` amplified path).
- [x] Integration test: capture a recording (use a fixture, not a live browser) → render → run the emitted Playwright spec against a sample web app → spec passes (at least the happy-path test; negative-scenario tests pass when the app handles those failure modes correctly, fail informatively when it doesn't). ✅ v0.7.3.

**Done when:** a recording exported from M5 produces a Playwright `.spec.ts` with multiple `test()` blocks (happy + negatives) that compiles and runs against the same app the recording was made against. Spec emits cleanly with or without an LLM provider configured. **✅ M6 done at v0.7.4.**

---

<!--
Deferred from v1:
- M7: VS Code extension (browser-first means browser-only in v1)
- M8: Second LLM adapter + parity test (proven structurally; add when a procurement constraint forces it)

Future milestones to consider when v1 is real:
- M3 reactivated: webspec gen + webspec init for unit-test-gen as a save-time watcher
- M9: Karma + Jasmine emitter (gated on inventory)
- M10: Cypress renderer alongside Playwright
- M11: In-extension recording playback + visual diffing
- M12: Network-response capture and replay (recorded mocks)
- M13: Coverage feedback loop (re-run Playwright, feed gaps to a second LLM amplification pass)
- M14: GitHub Action surface
- M15: Optional Bellese LLM proxy
-->
