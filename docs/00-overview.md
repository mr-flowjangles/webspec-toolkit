# 00 — Overview

## What this tool does

Three test-related capabilities behind one shared core:

1. **Generates Angular Jest unit tests from source.**
2. **Runs Section 508 + WCAG 2.1 AA audits** against Angular apps.
3. **Records user workflows in Chrome and emits Playwright e2e tests.**

Exposed as a VS Code extension, a Chrome extension, and a CLI. The LLM provider is pluggable; the user brings their own key. The recorder works without a key — the LLM polishes test names, assertions, and selector hardening.

## Who it's for

Bellese engineers building Angular 19+ frontends for customers with Section 508 obligations, **and** the non-developers (QA, designers, 508 reviewers, PMs) who need to verify behavior without writing code. The recorder is the surface that admits the second audience — they navigate the app, hit "stop," and a runnable Playwright spec lands.

## v1 scope

**In scope:**

- **Unit tests:** Jest `.spec.ts` generation for Angular 19+ standalone components, services, directives, and pipes; mocking of injected deps with sensible defaults (HttpClient, Router, ActivatedRoute, common stores).
- **A11y:** axe-core-powered audits with `wcag21aa` + `section508` rule tags, against running URLs and built static bundles.
- **E2E:** Chrome-extension recorder captures clicks / form fills / navigation / key events / network calls, hardens selectors (data-testid > role/aria > text > css), and the e2e renderer emits a Playwright `.spec.ts`. LLM names the test and inserts assertions.
- Normalized `Analysis` artifact consumed by every UI surface (see `01-architecture.md`). Three variants: `TestPlan`, `A11yReport`, `WorkflowRecording`.
- Pluggable LLM adapters: Anthropic, OpenAI in v1.
- VS Code extension: right-click → "Generate Spec," sidebar a11y panel, AWS region/profile settings. (No recording UI in v1 — that's the Chrome ext.)
- Chrome extension: popup with two modes — "Audit this tab" (a11y) and "Record" (e2e capture).
- CLI: `webspec init`, `gen <path>`, `audit <url>`, and `record-to-spec <recording.json>` (renders a recording into Playwright code).
- Drop-in config file (`webspec.config.json`) with auto-detected defaults.

**Explicitly out of scope for v1:**

- Karma + Jasmine emitter.
- Cypress emitter (Playwright is the v1 target).
- Angular ≤ 18.
- Replay of recordings inside the Chrome extension. Users run the emitted Playwright spec like any other test.
- Network-response mocking. v1 captures requests but doesn't stub responses.
- Manual-a11y workflow tooling (annotations, sign-off).
- Bellese-managed LLM proxy / shared keys.
- Telemetry, usage analytics, marketplace publishing automation.

## High-level flow

```
                                 ┌──────────────────────────┐
  Angular source file ─────────▶ │                          │ ─▶ Jest .spec.ts
                                 │   core                   │
  Running URL / static bundle ─▶ │   Phase 1: Analyze       │ ─▶ A11y report (JSON / MD)
                                 │   Phase 2: Render        │
  Recorded user workflow ──────▶ │                          │ ─▶ Playwright .spec.ts
  (DOM + network event trace)    │                          │
                                 └────────────┬─────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              ▼                               ▼                               ▼
      ┌────────────────┐             ┌────────────────┐             ┌────────────────┐
      │ VS Code        │             │ Chrome         │             │ CLI            │
      │ extension      │             │ extension      │             │ (CI / scripts) │
      │ • gen          │             │ • audit        │             │ • init         │
      │ • audit        │             │ • record       │             │ • gen          │
      │                │             │                │             │ • audit        │
      │                │             │                │             │ • record-to-   │
      │                │             │                │             │   spec         │
      └────────────────┘             └────────────────┘             └────────────────┘
```

The contract between core and any UI surface is the typed `Analysis` artifact (a discriminated union — `TestPlan` | `A11yReport` | `WorkflowRecording`). Surfaces _render_ it; they don't re-analyze.

## Reading order

**Design (the what and why):**

1. **This doc** — the what and why.
2. `01-architecture.md` — the spine: Phase 1 (Analyze) → `Analysis` artifact → Phase 2 (Render).
3. _(subsystem deep-dives `02-` through `06-` to be added as the design firms up: contract spec, LLM provider interface, a11y engine wrapper, recorder protocol, VS Code surface, Chrome surface.)_

**Build (the how and when):**

7. `07-build-plan.md` — milestones M0 → M8, ordered tasks, checkboxes.

**Tracking:**

99. `99-open-questions.md` — what's deferred and why.

## North-star direction (post-v1)

- Karma + Jasmine emitter (M-future once active Bellese projects are inventoried).
- Cypress renderer alongside Playwright.
- In-Chrome recording playback + visual diffing on each replay.
- Network-response mocking captured at recording time and replayed deterministically.
- Coverage feedback loop: re-run the suite and feed gaps back into the unit-test generator.
- Dev-time a11y watcher: incremental audit on every save during `ng serve`.
- GitHub Action surface: same `core`, run on PR, comment a diff of new violations.
- Optional Bellese-managed LLM proxy for teams that want centralized billing and audit logs (see `99-open-questions.md`).
