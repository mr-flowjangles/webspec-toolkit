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

## Should we ship a Bellese-managed LLM proxy?

**Status:** open
**Resolution trigger:** a customer or team explicitly asks for centralized billing / audit logs / shared keys, OR procurement blocks individual API keys.
**Notes:** v1 is BYOK to keep the architecture simple and avoid hosting infra. The `LLMProvider` interface admits a `BellesProxyAdapter` later without changing renderers. Terraform stub in `infra/terraform/` reserved for this case.

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
**Resolution trigger:** M6 implementation. Specifically: whether axe needs to run in the page (content script) vs the worker, given V3's restrictions on `eval` and lack of `window` in the service worker.
**Notes:** Current expectation is content-script injection of `axe-core/browser`, with the popup messaging the content script. Worth re-validating with a spike before M6 starts.
