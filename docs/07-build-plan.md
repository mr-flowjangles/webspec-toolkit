# 07 — Build plan

The implementation order is the order in this doc. Milestones are sequential, tasks within a milestone are ordered. **We check the boxes as we go.** When a milestone is fully checked, the next one starts.

If something forces us off this plan (a discovered constraint, a customer arriving early, etc.), we update this doc *first*, then change course. Don't drift silently.

The convention is `## M<N> — {Title}` so `make version-M<N>` can auto-resolve the milestone title from this file.

## v1 — Definition of Done

v1 ships when **all** of the following are true:

- [ ] Docker image builds reproducibly (`make image`) and `bellese-test --help` works in the smoke test.
- [ ] CLI: `bellese-test gen <component.ts>` produces a Jest `.spec.ts` that compiles and runs against a sample Angular 19+ app.
- [ ] CLI: `bellese-test audit <url>` produces a normalized JSON + Markdown a11y report tagged `wcag21aa` + `section508`.
- [ ] VS Code extension: right-click on a `.component.ts` → "Generate Spec" produces the same output as the CLI; sidebar a11y panel runs against `localhost:4200`.
- [ ] Chrome extension: popup → "Run audit on this tab" returns a findings list and copies a fixed-format report to clipboard.
- [ ] LLM provider switch is a config change. Both Anthropic and OpenAI adapters pass the same fixture-based contract test.
- [ ] All milestones below are checked.
- [ ] `README.md` has a quickstart that a new operator can follow end-to-end.

---

## M0 — Foundations

Goal: project skeleton ready, dev environment wired, no feature code yet.

- [ ] Initialize git repo, make initial commit of design docs and scaffold.
- [ ] Add root `package.json` and `pnpm-workspace.yaml`; create empty `packages/{core,cli,vscode-extension,chrome-extension,config}` with stub `package.json` files.
- [ ] Pin Node + pnpm versions in `.nvmrc` / `package.json#packageManager`.
- [ ] Wire `make setup` → `pnpm install`, `make test` → `pnpm -r test`, `make lint` → `pnpm -r lint`, `make format` → `pnpm -r format`.
- [ ] Add TypeScript project references across packages; verify `tsc -b` builds clean.
- [ ] Add ESLint + Prettier at the root; verify `pnpm -r lint` passes on empty packages.
- [ ] Add Vitest at the root for `core` unit tests; verify `make test` passes with no tests.
- [ ] Verify `make ci` passes.
- [ ] Replace the `Dockerfile` stub with a multi-stage Node 20 build that produces a CLI-only image; verify `make image` and `make smoke` run.
- [ ] Verify versioning ceremony: `./scripts/new-version.sh --dry-run "Smoke Test"` prints the plan with no side effects.

**Done when:** monorepo builds, `make ci` is green, Docker image builds + smoke-tests, versioning ceremony runs cleanly.

---

## M1 — Contract artifact + LLM provider seam

Goal: lock the `Analysis` shape and the `LLMProvider` interface in code; ship one adapter; nothing else.

- [ ] Create `packages/core/src/types/analysis.ts` matching the sketch in `01-architecture.md`. Add zod schemas alongside.
- [ ] Create `packages/core/src/llm/provider.ts` defining `LLMProvider`. Document the contract.
- [ ] Implement `AnthropicAdapter` (`packages/core/src/llm/anthropic.ts`) with structured-output validation via zod.
- [ ] Add a fixture-based test that asserts: given a known prompt + recorded mock response, the adapter validates and returns a typed value.
- [ ] Decision recorded in `02-contract-spec.md`: schemaVersion strategy and the rule for evolving the IR without breaking surfaces.

**Done when:** `Analysis`, `LLMProvider`, and `AnthropicAdapter` exist; the contract test passes; `02-contract-spec.md` is written.

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

Goal: validate the contract through the simplest UI before tackling the IDE/browser surfaces.

- [ ] `packages/cli/`: `bellese-test gen <path>` reads source, runs analysis, writes `.spec.ts` next to the source.
- [ ] `bellese-test audit <url>` is stubbed (returns "M4 not yet implemented" — wired for the contract).
- [ ] Implement `bellese-test.config.json` resolution + Angular-project auto-detection in `packages/config/`.
- [ ] Exit codes: 0 success, 2 user error, 3 LLM/provider error, 4 internal error.
- [ ] Integration test: run the CLI against a sample repo, verify file emitted + Jest passes.

**Done when:** `bellese-test gen` is usable end-to-end against a sample Angular repo from a fresh checkout.

---

## M4 — A11y analyzer + report renderer

Goal: WCAG 2.1 AA + Section 508 audits running through the same `Analysis` contract.

- [ ] `A11yAnalyzer` (Node mode): wrap `@axe-core/puppeteer`, run with tags `['wcag21aa','section508']`, validate output into `A11yReport`.
- [ ] `ReportRenderer`: emit JSON and Markdown (severity grouping, rule tag column, selector + fix-hint per finding).
- [ ] CLI: implement `bellese-test audit <url>` end-to-end.
- [ ] Tests: snapshot-test the Markdown renderer against a recorded axe result.

**Done when:** `bellese-test audit https://example.com` produces a clean Markdown report with each finding tagged 508 / WCAG / both.

---

## M5 — VS Code extension

Goal: in-editor surface for both capabilities.

- [ ] Scaffold the extension with `yo code` (or equivalent); set up `vsce package`.
- [ ] BYOK settings: provider selector + key in VS Code SecretStorage.
- [ ] Command: `Bellese Test: Generate Spec for Active File` → calls `core` → writes `.spec.ts`.
- [ ] Command: `Bellese Test: Run A11y Audit (URL)` → input box for URL → calls `core` → opens a webview panel rendering the `A11yReport`.
- [ ] Sidebar panel: most-recent `Analysis` + "Re-run" button.
- [ ] Manual test against a sample Angular 20 project. Document the install (VSIX) flow in the project README.

**Done when:** VSIX installs in VS Code, both commands work end-to-end, keys persist across reloads.

---

## M6 — Chrome extension

Goal: runtime a11y on any page; popup shows findings + copy-as-Markdown.

- [ ] Scaffold Manifest V3 extension; bundle the **browser flavor** of `core` (a11y + report renderer; no test generator, no Node imports).
- [ ] Content script injects `axe-core` browser build; scans on demand from the popup.
- [ ] Popup React UI renders the `A11yReport`; "Copy report" button copies the Markdown rendering.
- [ ] BYOK settings page (chrome.storage). LLM key is required only if/when LLM-backed remediation suggestions are added — v1 of the Chrome extension does not call the LLM.
- [ ] Verify on three deployed Bellese sites; confirm parity with CLI for the same URLs.

**Done when:** unpacked extension installs in Chrome, popup audit returns the same findings the CLI does for the same URL, copy-as-Markdown works.

---

## M7 — Second LLM adapter + provider parity test

Goal: prove the LLM-provider seam by adding a second adapter.

- [ ] Implement `OpenAIAdapter`. Same `LLMProvider` interface. Same zod-validated outputs.
- [ ] Add a parity test: given the same fixture component and prompt, both adapters return a `TestPlan` with the same shape (assertion is structural — case count, surface coverage — not exact text).
- [ ] CLI flag + config option: `--provider anthropic|openai`.
- [ ] Document adding a third adapter in `docs/03-llm-provider-interface.md` (created in this milestone).

**Done when:** `--provider openai` and `--provider anthropic` both produce passing generated tests for the M2 example components; parity test is green.

---

<!--
Future milestones to consider when v1 is real:
- M8: Karma + Jasmine emitter (gated on a Bellese-project inventory — see 99-open-questions.md)
- M9: Coverage feedback loop (re-run Jest, feed gaps to a second LLM pass)
- M10: GitHub Action surface
- M11: Optional Bellese LLM proxy
-->
