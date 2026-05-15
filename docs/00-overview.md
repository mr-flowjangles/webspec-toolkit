# 00 — Overview

## What this tool does

**webspec is a browser-based shift-left companion for web app development.** A developer (or designer, QA, 508 reviewer, PM) walks through a web app in Chrome; the tool catches problems before formal testing. Three capabilities, all on a live page:

1. **Records workflows** — clicks, fills, navigation, network calls — with hardened selectors.
2. **Turns the workflow into a runnable Playwright spec with positive AND negative scenarios** — the recorded happy path, plus LLM-amplified failure modes (empty input, invalid input, error states, edge variants).
3. **Audits the page for Section 508 + WCAG 2.1 AA issues**.

The whole point is short feedback loops. The tool runs while you're building, not after.

Primary surface in v1 is the **Chrome extension**. A thin **CLI** ships for CI integration (`webspec audit`, `webspec record-to-spec`). VS Code is post-v1.

The LLM provider is pluggable; v1 ships a Bedrock adapter (Anthropic models via AWS Bedrock with standard AWS credentials). The recorder works without a key — the LLM amplifies recordings at render time, it doesn't drive capture.

## Who it's for

Engineers building web frontends for federal and federal-adjacent customers, where Section 508 compliance is contractual and quality bugs caught late are expensive. Plus the non-developers (QA, designers, 508 reviewers, PMs) who can drive the recorder without writing code. The tool is **framework-agnostic by design** for the page-observing capabilities — it watches rendered output and DOM events, not source.

## v1 scope

**In scope:**

- **Chrome extension (the primary surface):** popup with two modes — "Audit this tab" (axe-core a11y, browser-mode) and "Record" (workflow capture → exported `WorkflowRecording` JSON).
- **A11y:** axe-core-powered audits with `wcag21aa` + `section508` rule tags. Available in both the Chrome ext and a `webspec audit <url>` CLI command for CI gating.
- **E2E (the v1 differentiator):** Chrome-extension recorder captures clicks / form fills / navigation / key events / network calls, hardens selectors (data-testid > role/aria > text > css), and the e2e renderer (`webspec record-to-spec`) emits a Playwright `.spec.ts` containing **the recorded happy path PLUS LLM-generated negative scenarios** (invalid input, empty fields, error states, edge variants).
- Normalized `Analysis` artifact consumed by every UI surface (see `01-architecture.md`). Three variants: `TestPlan`, `A11yReport`, `WorkflowRecording`. (`TestPlan` shipped in M2 as foundation; reusable by M6 for amplification output.)
- Pluggable LLM adapters via `LLMProvider` interface; v1 ships `BedrockAdapter`. The recorder works without a key.

**Explicitly out of v1 active path:**

- **Unit-test generation from source files.** Shipped in v0.3.0 (M2) as foundation; reusable by M6's amplification path. CLI surface for it (`webspec gen`) deferred — unit-test gen from source isn't a shift-left signal in v1.
- **VS Code extension.** Browser-first means browser-only in v1.
- **Karma + Jasmine** emitter.
- **Cypress** emitter (Playwright is the v1 e2e target).
- Replay of recordings inside the Chrome extension. Users run the emitted Playwright spec like any other test.
- Network-response mocking. v1 captures requests but doesn't stub responses.
- Manual-a11y workflow tooling (annotations, sign-off).
- Bellese-managed LLM proxy / shared keys.
- Telemetry, usage analytics, marketplace publishing automation.
- Second LLM adapter (proven structurally via the `LLMProvider` seam; second adapter post-v1).

## High-level flow

```
                                 ┌──────────────────────────┐
  Recorded user workflow ──────▶ │                          │ ─▶ Playwright .spec.ts
  (DOM + network event trace)    │   core                   │     (happy path +
                                 │   Phase 1: Analyze       │      LLM-amplified
                                 │   Phase 2: Render        │      negative scenarios)
                                 │                          │
  Running URL / live DOM ──────▶ │                          │ ─▶ A11y report (JSON / MD)
                                 └────────────┬─────────────┘
                                              │
                          ┌───────────────────┴────────────────┐
                          ▼                                    ▼
                ┌────────────────┐                   ┌────────────────┐
                │ Chrome         │                   │ CLI            │
                │ extension      │                   │ (CI / scripts) │
                │ (v1 primary)   │                   │ • audit        │
                │ • audit        │                   │ • record-to-   │
                │ • record       │                   │   spec         │
                └────────────────┘                   └────────────────┘
```

The contract between core and any UI surface is the typed `Analysis` artifact (a discriminated union — `TestPlan` | `A11yReport` | `WorkflowRecording`). Surfaces _render_ it; they don't re-analyze.

## Reading order

**Design (the what and why):**

1. **This doc** — the what and why.
2. `01-architecture.md` — the spine: Phase 1 (Analyze) → `Analysis` artifact → Phase 2 (Render).
3. `02-contract-spec.md` — how the `Analysis` discriminated union is shaped, validated, and evolved.

**Build (the how and when):**

4. `07-build-plan.md` — milestones in order, ordered tasks, checkboxes.

**Post-v1 design:**

8. `08-test-library.md` — v1.2 (on-disk test library + Playwright UI as the run surface) → v1.3 (auth injection) → v1.4 (suites).

**Tracking:**

99. `99-open-questions.md` — what's deferred and why.

## North-star direction (post-v1)

- **Test library + Playwright UI workflow (v1.2 → v1.4).** Designed in `docs/08-test-library.md`. The extension authors the test (name, description, run-as user, captured events) and Save writes a per-test folder under `~/Downloads/webspec/<slug>/`. Playwright UI (`playwright test --ui`) is the see-and-execute surface — we don't build a custom library tab. v1.3 makes the `runAs` field functional via header-injection auth (ModHeader-style); v1.4 adds suites for chained test composition.
- **Unit-test gen as a save-time watcher.** The M2 work (Angular source → Jest spec) shipped as foundation. If a save-time integration earns its way back as a shift-left signal, it reactivates.
- **VS Code surface** for the audit + amplification panels.
- **Cypress renderer** alongside Playwright.
- **In-Chrome recording playback + visual diffing** on each replay.
- **Network-response mocking** captured at recording time and replayed deterministically.
- **Coverage feedback loop:** re-run the suite and feed gaps back into the amplification prompt for a second pass.
- **GitHub Action surface:** same `core`, run on PR, comment a diff of new violations.
- Optional Bellese-managed LLM proxy for teams that want centralized billing and audit logs.
