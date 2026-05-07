# 99 — Open questions

Decisions deliberately deferred from v1, with their resolution triggers.

<!--
Format for each entry:

## {Question phrased as a question}

**Status:** open / resolved / deferred to v2
**Resolution trigger:** what would force this to become urgent (a customer ask, a regulatory change, a perf cliff, ...).
**Notes:** discussion, ruled-out alternatives, current leaning.

Keep this file living. When a decision is made, move the entry's status to "resolved" and add a one-liner pointing to the doc/PR that resolved it. Don't delete — the trail is useful.
-->

## When do we add Karma + Jasmine emitter support?

**Status:** deferred to v2
**Resolution trigger:** an inventory of active Bellese Angular projects shows ≥ 30% on Karma+Jasmine, or a specific project asks for it.
**Notes:** v1 ships Jest only because (a) Angular 19+ baseline, (b) Jest's mocking model is simpler for the LLM to reason about, (c) every additional emitter doubles the golden-test surface in `TestRenderer`. Adding it later is a bounded scope: a new renderer module + framework-flag plumbing through `TestPlan`.

## When do we add a Cypress renderer alongside Playwright?

**Status:** deferred to v2
**Resolution trigger:** a Bellese project explicitly uses Cypress and the team won't migrate to Playwright.
**Notes:** Playwright was picked for v1 because of its codegen pedigree (we mimic that flow), multi-browser support, and modern API. Adding Cypress is a new `E2ERenderer` flavor + a `framework: 'playwright' | 'cypress'` switch on `WorkflowRecording`. Bounded scope.

## Should we centralize Bedrock access (Bellese-shared AWS account / proxy)?

**Status:** open
**Resolution trigger:** a Bellese team explicitly asks for centralized billing / audit logs / shared model allocation, OR a customer's procurement blocks per-developer AWS access.
**Notes:** v1 uses each developer's own AWS credentials (standard credential chain) calling Bedrock directly via `BedrockAdapter`. The `LLMProvider` interface admits a `BellesProxyAdapter` later — a thin HTTP service in front of a Bellese-owned AWS account that proxies Bedrock calls — without changing renderers. Terraform stub in `infra/terraform/` reserved for this case. Worth flagging: a proxy adds infra to maintain (deploys, secrets, observability, on-call) — the per-developer-AWS path is the simplest and most auditable until a concrete reason forces the change.

## How do we detect a project's testing conventions beyond framework?

**Status:** open
**Resolution trigger:** the first Bellese project where the auto-detected defaults produce tests that don't match house style (e.g., custom matcher imports, bespoke testing harnesses).
**Notes:** v1 reads `angular.json` for framework, infers component style (standalone vs NgModule) from imports, and otherwise uses defaults. A richer config schema with explicit overrides will likely follow once we see real-world misses.

## Streaming LLM responses to the VS Code editor?

**Status:** deferred to v2
**Resolution trigger:** generation latency feels unacceptable in user feedback. Anecdotally a one-shot ~10s round-trip is fine; if it climbs past 30s we revisit.
**Notes:** Streaming complicates the structured-output validation seam (the response isn't valid JSON until complete). A "generate-then-stream-render" approach is plausible but architecturally heavier than v1 needs.

## Telemetry — do we want any?

**Status:** open
**Resolution trigger:** support load is high enough that we need to know which features get used. Or a customer requires audit logging.
**Notes:** None in v1. If added, it must be opt-in, anonymized, and never include source code or LLM responses. Default off.

## Cache strategy for LLM calls within a session?

**Status:** open
**Resolution trigger:** the first user reports re-running generation for an unchanged file and being charged twice.
**Notes:** Hashing the prompt (file SHA + analyzer config + model + provider) and caching the validated `TestPlan` on disk under `.bellese-test/cache/` is the obvious move. Deferred until usage shows it matters.

## How does the Chrome extension share `core` code without an IPC daemon?

**Status:** resolved
**Resolution:** `core` is built in two flavors via a build seam — a Node bundle (CLI, VS Code) and a browser bundle (Chrome) that excludes Node-only analyzers. Documented in `01-architecture.md` non-goals.

## How will Manifest V3 service-worker constraints affect axe-core invocation in Chrome?

**Status:** open
**Resolution trigger:** M5 implementation. Specifically: whether axe needs to run in the page (content script) vs the worker, given V3's restrictions on `eval` and lack of `window` in the service worker.
**Notes:** Current expectation is content-script injection of `axe-core/browser`, with the popup messaging the content script. Worth re-validating with a spike before M5 starts.

## What's the selector-hardening priority for the recorder?

**Status:** leaning resolved (data-testid > role+name > text > css), confirm at M5 spike
**Resolution trigger:** M5 spike against three real Bellese sites — if too many elements lack `data-testid` and `aria-label` and the text-based fallback produces brittle selectors, we revisit.
**Notes:** Playwright's own codegen orders: `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, then css. We're prioritizing `data-testid` first because Bellese projects can be coached to add them; the `data-testid` opt-in produces the most stable tests. If a site has no `data-testid` coverage, we fall back to Playwright's order. Document the policy in `04-recorder-protocol.md` once written.

## M2 e2e: live Jest verification against a sample Angular 20 app

**Status:** deferred to M3
**Resolution trigger:** M3 CLI work needs an Angular fixture app for end-to-end testing (`bellese-test gen` → `.spec.ts` → Jest run → assert pass). That same harness verifies the M2 done-when criterion. No reason to build it twice.
**Notes:** v0.3.0 (M2) shipped with parser + renderer + 3 hand-authored TestPlan fixtures. The renderer's output is verified by golden tests and integration assertions on idiom presence (e.g. `provideHttpClientTesting`, `imports: [Component]`, signal-aware `setInput`). What's NOT verified yet: that the rendered `.spec.ts` actually compiles + runs under Jest in a real Angular 20 app. To close that gap: bootstrap a minimal Angular 20 app under `tests/fixtures/angular-app/` with `jest-preset-angular`, run the rendered specs through Jest, assert pass. Best done as part of M3 since the CLI wants the same fixture for its own e2e.

## How does a recording get from the Chrome extension to a Node renderer?

**Status:** leaning resolved (download `recording.json`, point CLI at it), confirm at M5
**Resolution trigger:** users finding the download flow too clunky. Alternative: a localhost HTTP daemon spun up by `bellese-test serve`, or a "Send to VS Code" button with the VS Code URL handler.
**Notes:** v1 ships download-to-disk because it's the lowest-friction path that requires no extra Bellese services. The `Analysis` artifact is JSON anyway, so the file IS the recording — no special transport needed. If users complain, a localhost daemon is the natural next step.

## What gets masked during recording? PHI? PII? Free-text fields?

**Status:** open — partial v1 answer
**Resolution trigger:** a user records a workflow that captures sensitive customer data and asks how to scrub.
**Notes:** v1 masks `<input type="password">` automatically; everything else is captured raw with a "review before sharing" warning in the export UI. Federal-customer recordings will inevitably touch PHI/PII; we need a richer policy (regex-based field masking? a marked-as-sensitive attribute pattern? per-recording scrub UI?). Defer concrete decision until we see what real recordings look like.

## In-extension replay of recordings — when?

**Status:** deferred to v2 (M11 in the future-milestones note)
**Resolution trigger:** users recording flows want fast feedback ("did this still work?") without leaving Chrome.
**Notes:** v1 emits a Playwright `.spec.ts`; users run replay via Playwright. Adding in-extension replay means re-implementing a chunk of Playwright in the browser; bigger scope than v1 wants. Visual diffing on replay is even further out.

## Network-response capture and replay (recorded mocks)?

**Status:** deferred to v2
**Resolution trigger:** a Bellese e2e test fails flakily because the backend it depends on is unstable in CI.
**Notes:** v1 records URLs + methods only. Recording response bodies and stubbing them on replay is the obvious next step but introduces meaningful storage + privacy concerns (response bodies often include PHI for our customers). Defer.
