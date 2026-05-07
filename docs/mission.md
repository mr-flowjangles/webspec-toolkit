# Angular Automated Testing — Mission Statement

## Mission

Cut the time Bellese Angular teams spend writing `.spec.ts` boilerplate and hunting accessibility regressions. The tool reads a component, service, or running app and produces (a) a complete first-draft Jest test suite that exercises inputs/outputs/dependencies, and (b) a Section 508 + WCAG 2.1 AA audit report with actionable fixes. It ships in two surfaces — a **VS Code extension** (test generation + dev-time a11y scans) and a **Chrome extension** (runtime a11y scans of deployed apps) — both backed by one shared core so behavior stays consistent and the LLM stays pluggable.

## Who this is for

Bellese engineers and contractors building Angular 19+ frontends for federal and federal-adjacent customers, where Section 508 compliance is a contractual obligation and unit-test coverage is a quality gate that consistently slips under deadline pressure. Audience attributes that shape design:

- TypeScript fluent; Jest familiar; mixed comfort with a11y rulesets.
- Working across multiple Bellese projects, not one — the tool must drop in without per-repo bespoke setup.
- Procurement constraints vary: customers and teams may use Anthropic, OpenAI, or other LLM vendors — the tool must not lock to one.

## What the tool must do

1. Read an Angular component, service, directive, or pipe (Angular 19+ standalone or NgModule) and emit a runnable Jest `.spec.ts` covering inputs, outputs, public methods, and injected dependencies (mocked).
2. Run a WCAG 2.1 AA + Section 508 audit against either a static build artifact (file path) or a running URL, and produce a normalized report (rule, severity, selector, fix hint).
3. Expose both capabilities through a **VS Code extension** (commands, sidebar) and a **Chrome extension** (popup against any tab) using one shared core.
4. Let the user pick their LLM provider (Anthropic, OpenAI, others) and supply their own key — no Bellese-hosted LLM dependency.
5. Drop into any Bellese Angular repo via a single `bellese-test.config.json`, with sensible auto-detected defaults when no config is present.

## Hard constraints

- **Section 508 / WCAG 2.1 AA coverage is non-negotiable.** Reports must distinguish 508 vs WCAG-only findings so federal-compliance reviewers can scope.
- **LLM-provider agnostic.** No file in the codebase may import a vendor SDK outside the corresponding adapter module. Switching providers must be a config change, not a code change.
- **No code or credentials sent off-device without user consent.** LLM calls are opt-in per session; a11y scans run locally.
- **Angular 19+ is the baseline.** Older versions are out of v1 scope.
- **Reusability across Bellese projects.** No project-specific assumptions baked into core; everything project-specific is config.

## Decisions Bellese has already made

- **Language:** TypeScript across all packages.
- **Test framework target:** Jest (Angular 19+ standard direction). Karma + Jasmine deferred (see `99-open-questions.md`).
- **Monorepo tooling:** pnpm workspaces. No Nx/Turbo for v1 — three packages don't need it.
- **LLM provider model:** BYOK with pluggable adapters. v1 ships Anthropic + OpenAI adapters; the interface admits more.
- **A11y engine:** axe-core with `wcag21aa` + `section508` tags. We do not roll our own ruleset.
- **Deployment:** Docker image for the CLI/headless mode; AWS Terraform stub kept for future team-shared services.
- **PR ownership:** Rob initiates PRs. Claude does not push branches or open PRs without explicit instruction.

## Scope explicitly *out* of v1

- Karma + Jasmine emitter (deferred — most active Bellese projects are on Jest or migrating).
- Angular 18 and earlier.
- E2E test generation (Playwright / Cypress).
- Manual a11y review workflow (annotation, sign-off, audit trail) — automated scanning only.
- Bellese-managed LLM proxy or shared API key infrastructure.
- Telemetry / usage analytics.
- Marketplace publishing automation. Internal install via VSIX and unpacked Chrome extension is enough for v1.

## Working style at Bellese

The team aligns on design before writing code. Decisions are recorded in version-controlled `docs/`. Deferred decisions are tracked explicitly with their resolution triggers. Unanticipated questions surfaced during implementation pause the work until the docs catch up — no silent decisions in code.

Versions follow three-part semver, one PR per version. Release notes are cumulative under `Versions/v{major}/v{major}.{minor}.{patch}/`.

---

## What this brief deliberately does NOT prescribe

To keep the design space open for the design exercise itself:

- The exact shape of the contract artifact between Phase 1 (analysis) and Phase 2 (rendering) — see `01-architecture.md`.
- How the test generator detects a project's testing conventions (heuristics? config schema? both?).
- Whether the Chrome extension talks to a local CLI/daemon for shared logic, ships its own bundle of `core`, or uses a hybrid.
- How the LLM provider interface negotiates streaming vs batch responses across vendors.
- Cache strategy for repeat LLM calls within a session.
