# 00 — Overview

## What this tool does

Generates Angular Jest unit tests from source, and runs Section 508 + WCAG 2.1 AA audits against Angular apps — through one shared core exposed as a VS Code extension, a Chrome extension, and a CLI. The LLM provider is pluggable; the user brings their own key.

## Who it's for

Bellese engineers building Angular 19+ frontends for customers with Section 508 obligations, who need test coverage and accessibility checks to be cheap and fast enough to actually do, repeatedly, across multiple repos.

## v1 scope

**In scope:**

- Jest `.spec.ts` generation for Angular 19+ standalone components, services, directives, and pipes.
- Mocking of injected dependencies with sensible defaults (HttpClient, Router, ActivatedRoute, common stores).
- axe-core-powered audits with `wcag21aa` + `section508` rule tags, against running URLs and built static bundles.
- Normalized `Analysis` artifact consumed by every UI surface (see `01-architecture.md`).
- Pluggable LLM adapters: Anthropic, OpenAI in v1.
- VS Code extension: right-click → "Generate Spec," sidebar a11y panel, BYOK settings.
- Chrome extension: popup → "Run 508 / WCAG audit on this tab," findings list with severity + selector copy.
- CLI: `bellese-test gen <path>` and `bellese-test audit <url>` for CI use.
- Drop-in config file (`bellese-test.config.json`) with auto-detected defaults.

**Explicitly out of scope for v1:**

- Karma + Jasmine emitter.
- Angular ≤ 18.
- E2E (Playwright / Cypress) test generation.
- Manual-a11y workflow tooling (annotations, sign-off).
- Bellese-managed LLM proxy / shared keys.
- Telemetry, usage analytics, marketplace publishing automation.

## High-level flow

```
                             ┌──────────────────────┐
  Angular source file ─────▶ │                      │ ─▶ Jest .spec.ts
                             │   core               │
  Running URL / static       │   (Phase 1: Analyze, │
  bundle                ───▶ │    Phase 2: Render)  │ ─▶ A11y report (JSON / Markdown)
                             │                      │
                             └──────────┬───────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
    ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
    │ VS Code        │         │ Chrome         │         │ CLI            │
    │ extension      │         │ extension      │         │ (CI / scripts) │
    └────────────────┘         └────────────────┘         └────────────────┘
```

The contract between core and any UI surface is the typed `Analysis` artifact. Surfaces _render_ it; they don't re-analyze.

## Reading order

**Design (the what and why):**

1. **This doc** — the what and why.
2. `01-architecture.md` — the spine: Phase 1 (Analyze) → `Analysis` artifact → Phase 2 (Render).
3. _(subsystem deep-dives `02-` through `06-` to be added as the design firms up: contract spec, LLM provider interface, a11y engine wrapper, VS Code surface, Chrome surface.)_

**Build (the how and when):**

7. `07-build-plan.md` — milestones M0 → M7, ordered tasks, checkboxes.

**Tracking:**

99. `99-open-questions.md` — what's deferred and why.

## North-star direction (post-v1)

- Karma + Jasmine emitter (M-future once active Bellese projects are inventoried).
- Coverage feedback loop: re-run the suite and feed gaps back into the generator.
- Dev-time a11y watcher: incremental audit on every save during `ng serve`.
- GitHub Action surface: same `core`, run on PR, comment a diff of new violations.
- Optional Bellese-managed LLM proxy for teams that want centralized billing and audit logs (see `99-open-questions.md`).
