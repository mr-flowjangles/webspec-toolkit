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
**Notes:** Hashing the prompt (file SHA + analyzer config + model + provider) and caching the validated `TestPlan` on disk under `.webspec/cache/` is the obvious move. Deferred until usage shows it matters.

## How does the Chrome extension share `core` code without an IPC daemon?

**Status:** resolved
**Resolution:** `core` is built in two flavors via a build seam — a Node bundle (CLI, VS Code) and a browser bundle (Chrome) that excludes Node-only analyzers. Documented in `01-architecture.md` non-goals.

## How will Manifest V3 service-worker constraints affect axe-core invocation in Chrome?

**Status:** resolved (v0.3.8)
**Resolution:** axe runs in the content script (where the live DOM lives), with the popup messaging the content script. The service worker stays out of the audit hot path; v0.5.2 added it as the chrome.storage.session broker for recorder state, and v0.5.3 added webNavigation listeners — both legitimate service-worker concerns that don't fight the no-`eval`/no-`window` constraints.

## What's the selector-hardening priority for the recorder?

**Status:** resolved (v0.5.1)
**Resolution:** `data-testid` (+ `data-test-id`/`data-test`/`data-cy`/`data-qa`) > ARIA role + accessible name > visible text > basic CSS. Each `HardenedSelector` carries `preferred`, `strategy`, and a `fallbacks[]` array. Non-unique selectors (e.g. TodoMVC's three "Toggle Todo" checkboxes) get a Playwright `>> nth=N` disambiguator appended at capture time; the text strategy skips disambiguation because text bubbles through ancestors. Verified end-to-end at v0.6.0 across example.com, react.dev, and TodoMVC.

## M2 e2e: live Jest verification against a sample Angular 20 app

**Status:** deferred to M3
**Resolution trigger:** M3 CLI work needs an Angular fixture app for end-to-end testing (`webspec gen` → `.spec.ts` → Jest run → assert pass). That same harness verifies the M2 done-when criterion. No reason to build it twice.
**Notes:** v0.3.0 (M2) shipped with parser + renderer + 3 hand-authored TestPlan fixtures. The renderer's output is verified by golden tests and integration assertions on idiom presence (e.g. `provideHttpClientTesting`, `imports: [Component]`, signal-aware `setInput`). What's NOT verified yet: that the rendered `.spec.ts` actually compiles + runs under Jest in a real Angular 20 app. To close that gap: bootstrap a minimal Angular 20 app under `tests/fixtures/angular-app/` with `jest-preset-angular`, run the rendered specs through Jest, assert pass. Best done as part of M3 since the CLI wants the same fixture for its own e2e.

## How does a recording get from the Chrome extension to a Node renderer?

**Status:** resolved (v0.5.4)
**Resolution:** Download-to-disk via `chrome.downloads`. Stop button opens a review panel showing duration / event counts / URL trail / sensitive-input warning; the user clicks **Download** to write the `recording.json` or **Discard** to drop it without writing. The file IS the artifact — `webspec record-to-spec <recording.json>` (M6) reads it directly, no special transport. The review-then-download gate addresses the "lowest-friction" concern while giving the user an out for sensitive captures. Localhost daemon / "Send to VS Code" alternatives remain available if user friction emerges in the wild.

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

---

## (v0.3.2 pivot) How does M6 amplification get from `WorkflowRecording` to Playwright source?

**Status:** resolved (v0.3.2)
**Resolution:** **Path C — e2e-shaped structured IR.** The LLM emits a typed structured object (an `AmplifiedRecording` or similarly named shape: `scenarios[]` each with `kind: 'happy' | 'negative'`, `name`, `description`, `actions[]` (typed: `fill`, `click`, `goto`, etc.), `assertions[]` (typed: `visible`, `text`, `url`, etc.)), zod-validated at the seam. A deterministic renderer formats that into Playwright source.

**Why C over the alternatives:**

- **Path A — TestPlan as IR (rejected).** Reuses M2's `TestPlan{cases[].arrange/act/assert}`, but the unit-test `arrange/act/assert` shape is a category mismatch for e2e flows. Forcing them through the same IR is symmetry for symmetry's sake.
- **Path B — Direct LLM-emits-Playwright-source (rejected).** Simpler short-term but loses the validation gate that the rest of the tool relies on. The LLM never writes shipped code anywhere else (M2 emits `cases[]`, not Jest source); breaking that pattern for M6 introduces a prompt-injection / malformed-output surface for no architectural gain.
- **Path C (resolved).** Same architectural pattern as M2 (LLM emits validated structured data; deterministic renderer formats it), shape adapted for e2e instead of unit. Buys: zod validation at the seam, goldenable rendering, easy retargeting to Cypress later (different renderer, same IR).

**Implementation note for M6:** the new IR is `AmplifiedRecording` (or whatever name lands at implementation), defined in `packages/core/src/types/analysis.ts` alongside `WorkflowRecording`. It is **not** a fourth `Analysis` variant — it's an intermediate produced by the M6 amplifying analyzer and consumed by the M6 renderer; the user-facing artifact remains `WorkflowRecording` (capture) and the rendered Playwright spec (output). The TestPlan widening (`framework: 'jest' | 'playwright'`) flagged in `02-contract-spec.md` is no longer needed.

## (v0.3.2 pivot) Does the unit-test-from-source path return post-v1 as a save-time watcher?

**Status:** resolved (v0.3.2)
**Resolution:** Yes — post-v1, as a save-time watcher in an editor (regenerate the spec on save; surface immediately if the spec breaks). That's a real shift-left signal, unlike the manual-CLI form. Foundation is intact in the codebase: parser at `packages/core/src/analyze/test-plan/`, renderer at `packages/core/src/render/test/`, fixtures + golden tests + integration test all green. When the watcher work picks up, M3 reactivates with a different scope (editor integration rather than `webspec gen` CLI).

## (v0.3.2 pivot) Is the v1 CLI surface area smaller than originally scoped?

**Status:** resolved
**Resolution:** Yes. Original M3 scoped a unified CLI with `init`, `gen`, `audit`, `record-to-spec`. Post-pivot, v1 CLI is just `audit` (ships with M4) and `record-to-spec` (ships with M6). `gen` and `init` deferred. Documented in `07-build-plan.md` "Out of v1 active path."

## (v0.5.0 deferred) LLM-amplified a11y checks — vision-based alt-text quality, link-text quality, heading-outline coherence

**Status:** deferred to post-v1 (Pro tier)
**Resolution trigger:** the first paying customer asks for "judgment" coverage beyond what static rules can see, OR we hit a competitive gap against Deque/Stark and need parity.
**Notes:** axe-core checks alt is *present*; it can't judge whether the alt is *good*. Multimodal vision LLMs can: send the image bytes + current alt to a Claude vision model, classify as `good | weak | misleading | decorative-but-marked-content | content-but-marked-decorative`, and produce a suggested alt. Same shape for link-text quality (flag "click here" / "read more") and heading-outline coherence (does the H-hierarchy actually make sense given the content). All three plug into the existing `LLMProvider` seam + `BedrockAdapter` (no new infrastructure).

**Why deferred:** real cost per audit (~$0.05–0.50 for image-heavy pages) eats the pricing flexibility of a free baseline. v1 keeps audits zero-marginal-cost so we can choose the pricing model later (freemium, audit-credits, Pro tier) without rearchitecting. Also: alt-text vision is a parity feature, not the webspec differentiator — the differentiator is shift-left record-and-replay → Playwright with negative scenarios.

**When it activates:** a Pro tier feature, gated by a `webspec.altTextCheck.enabled` (and similar) flag, defaulting off. v0.5.0 already widened axe's tag set to include `best-practice`, which gets us the cheap automated coverage (`landmark-one-main`, `region`, `heading-order`, etc.) without any LLM cost — the obvious next step before turning on paid LLM checks.

---

## (v0.3.5 surface) Should the a11y rule-set tag filter include `wcag2a` (Level A) too?

**Status:** resolved (v0.3.6)
**Resolution:** Option 1 — widened `A11yRuleTagSchema` to `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508']`. Both `SURFACED_TAGS` (output filter) and `DEFAULT_A11Y_TAGS` (axe input filter) updated. The renderer's humanizer rolls any `wcag*` tag up to a single "WCAG 2.1 AA" label for display while the contract preserves the granular breakdown.

**Verification:** the same deliberately-broken HTML used to surface the bug now reports 4 violations instead of 2: `image-alt` and `label` (both Level A) gain the `WCAG 2.1 AA` label they were missing, and `color-contrast` (Level AA on `wcag2aa`) + `html-has-lang` (Level A on `wcag2a`) now appear at all — pre-v0.3.6 axe wasn't even running them because we only requested `wcag21aa` + `section508` as input tags.
