# Angular Automated Testing — Mission Statement

## Mission

Cut the time Bellese teams spend on three recurring testing chores: writing Angular unit-test boilerplate, hunting accessibility regressions, and authoring end-to-end tests for the workflows the customer actually uses. The tool reads source files, scans running apps, and watches users perform real workflows — and produces (a) Jest unit tests, (b) Section 508 + WCAG 2.1 AA audit reports, and (c) Playwright e2e tests recorded from live browser interactions. It ships in two surfaces — a **VS Code extension** (in-flow authoring for devs) and a **Chrome extension** (a11y scans + workflow recording for everyone, including non-developers) — both backed by one shared core so behavior stays consistent and the LLM stays pluggable.

## Who this is for

Bellese engineers and contractors building Angular 19+ frontends for federal and federal-adjacent customers, where Section 508 compliance is a contractual obligation and unit-test coverage is a quality gate that consistently slips under deadline pressure. Audience attributes that shape design:

- TypeScript fluent; Jest familiar; mixed comfort with a11y rulesets.
- Working across multiple Bellese projects, not one — the tool must drop in without per-repo bespoke setup.
- Procurement constraints vary: customers and teams may use Anthropic, OpenAI, or other LLM vendors — the tool must not lock to one.

## What the tool must do

1. **Generate unit tests from source.** Read an Angular component, service, directive, or pipe (Angular 19+ standalone or NgModule) and emit a runnable Jest `.spec.ts` covering inputs, outputs, public methods, and injected dependencies (mocked).
2. **Audit accessibility.** Run a WCAG 2.1 AA + Section 508 audit against either a static build artifact (file path) or a running URL, and produce a normalized report (rule, severity, selector, fix hint).
3. **Record workflows and emit e2e tests.** While a user (dev, QA, or non-technical reviewer) navigates a running app in Chrome, capture their interactions — clicks, form fills, navigation, key events — and emit a runnable Playwright `.spec.ts` that reproduces the flow with hardened selectors and LLM-named assertions.
4. **Expose all three capabilities** through a **VS Code extension** (commands, sidebar) and a **Chrome extension** (popup with audit + recorder modes) using one shared core. The CLI exposes the same capabilities for CI use.
5. Reach Anthropic models via AWS Bedrock using standard AWS credentials. The `LLMProvider` interface is provider-agnostic so future adapters (other Bedrock models, direct API, etc.) can be added without renderer changes.
6. Drop into any Angular repo via a single `webspec.config.json`, with sensible auto-detected defaults when no config is present.

## Hard constraints

- **Section 508 / WCAG 2.1 AA coverage is non-negotiable.** Reports must distinguish 508 vs WCAG-only findings so federal-compliance reviewers can scope.
- **LLM-provider agnostic at the seam.** No file in the codebase may import a vendor/cloud SDK outside the corresponding adapter module. Switching providers (or adding new ones) must be a code change scoped to a new adapter file plus a config flip, never a renderer change.
- **No code or credentials sent off-device without user consent.** LLM calls are opt-in per session; a11y scans run locally.
- **Angular 19+ is the baseline.** Older versions are out of v1 scope.
- **Reusability across Bellese projects.** No project-specific assumptions baked into core; everything project-specific is config.

## Decisions Bellese has already made

- **Language:** TypeScript across all packages.
- **Unit-test framework target:** Jest (Angular 19+ standard direction). Karma + Jasmine deferred (see `99-open-questions.md`).
- **E2E framework target:** Playwright. Cypress deferred (see `99-open-questions.md`).
- **Monorepo tooling:** pnpm workspaces. No Nx/Turbo for v1.
- **LLM access via AWS Bedrock.** Bellese's federal-customer work runs on AWS-resident infrastructure for compliance reasons; all Anthropic-model traffic goes through **Amazon Bedrock** with the standard AWS SDK default credential chain (env vars, `~/.aws/credentials`, IAM instance role) — never the direct Anthropic API. v1 ships a `BedrockAdapter`; the `LLMProvider` interface admits future providers (OpenAI on Bedrock or direct, etc.) but they're not v1 scope. The LLM is value-add for the recorder (naming tests, generating assertions, hardening selectors), not load-bearing — recordings still work without a configured provider.
- **A11y engine:** axe-core with `wcag21aa` + `section508` tags. We do not roll our own ruleset.
- **Deployment:** Docker image for the CLI/headless mode; AWS Terraform stub kept for future team-shared services.
- **PR ownership:** Rob initiates PRs. Claude does not push branches or open PRs without explicit instruction.

## Scope explicitly _out_ of v1

- Karma + Jasmine emitter (deferred — most active Bellese projects are on Jest or migrating).
- Cypress emitter (deferred — Playwright is the v1 target; Cypress is a future renderer if a project requires it).
- Angular 18 and earlier.
- Replay of recorded workflows from inside the Chrome extension itself — v1 records and emits `.spec.ts`; users run replay via Playwright like any other test.
- Network-response mocking captured during recording. v1 captures requests; mocking is deferred until usage shows it matters.
- Manual a11y review workflow (annotation, sign-off, audit trail) — automated scanning only.
- Bellese-managed LLM proxy or shared AWS account / shared Bedrock allocation infrastructure.
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
- Selector-hardening policy for the recorder (data-testid first? role-based fallbacks? text-based?). See `99-open-questions.md`.
- How a recording is transported from the Chrome extension to a local file (download a JSON, paste into the CLI, post to a localhost daemon, etc.).
- Secret/PII masking during recording (passwords, tokens, PHI in form fields).
