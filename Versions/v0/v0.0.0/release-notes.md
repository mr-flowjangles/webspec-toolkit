# v0.0.0 — Initial Design (2026-05-07)

## Problem

Bellese Angular teams burn time on two recurring chores: writing `.spec.ts` boilerplate that every component, service, directive, and pipe needs, and chasing Section 508 / WCAG accessibility regressions that only get caught late. We have no shared tooling that does either, and per-project hacks don't compose.

## Solution

Bootstrap a single project — `angular-automated-testing` — that exposes one shared `core` (Phase 1: Analyze → typed `Analysis` artifact → Phase 2: Render) through three surfaces: a CLI, a VS Code extension, and a Chrome extension. Test generation is LLM-backed with a pluggable provider interface (BYOK, Anthropic + OpenAI in v1). Accessibility is axe-core with `wcag21aa` + `section508` rule tags. Angular 19+ standalone components are the v1 baseline; Jest is the test framework target.

This commit locks no application code — it locks the design.

## New

- **Project scaffold** copied from `bellese-starter-pack/template/`. README, CLAUDE.md, Makefile, Dockerfile stub, `.gitignore` / `.dockerignore`, `infra/terraform/` placeholder, `scripts/new-version.sh` versioning ceremony, `Versions/v0/v0.0.0/`.
- **Mission statement** (`docs/mission.md`). Target audience, must-do behaviors, hard constraints, locked decisions, explicit v1 out-of-scope.
- **Overview** (`docs/00-overview.md`). v1 in/out scope, ASCII flow, reading order, north-star direction.
- **Architecture** (`docs/01-architecture.md`). The spine — two phases with the typed `Analysis` artifact as the contract. LLM-provider seam isolated in `core/llm`. Surfaces (CLI, VS Code, Chrome) consume `Analysis`; none re-analyze.
- **Build plan** (`docs/07-build-plan.md`). M0 foundations, M1 contract artifact + first LLM adapter, M2 test generator end-to-end, M3 CLI, M4 a11y analyzer + report renderer, M5 VS Code extension, M6 Chrome extension, M7 second LLM adapter + provider-parity test. v1 Definition of Done at the top.
- **Open questions** (`docs/99-open-questions.md`). Karma+Jasmine timing, Bellese-managed LLM proxy, telemetry, caching, Manifest V3 axe constraints — each with a resolution trigger.
- **Locked decisions:**
  - Language: TypeScript across all packages.
  - Test framework target: Jest. Karma+Jasmine deferred.
  - Angular baseline: 19+ standalone components (Bellese projects are on Angular 20).
  - Monorepo: pnpm workspaces (no Nx/Turbo for v1).
  - LLM model: provider-agnostic via `LLMProvider` interface; BYOK; v1 adapters for Anthropic + OpenAI.
  - A11y engine: axe-core with `wcag21aa` + `section508` tags.
  - Surfaces: CLI, VS Code extension, Chrome extension — all on shared `core`.

## Files Changed

| File | Change |
|------|--------|
| `README.md` | New — project status and pointers (placeholders substituted) |
| `CLAUDE.md` | New — repo-level context for Claude sessions (placeholders substituted + tech-choices filled) |
| `Makefile` | New — dev targets and versioning ceremony (placeholders substituted) |
| `Dockerfile` | New — runtime image stub (placeholders substituted) |
| `.gitignore` | New |
| `.dockerignore` | New |
| `docs/mission.md` | New — what + who + constraints + locked decisions |
| `docs/00-overview.md` | New — v1 scope, flow diagram, reading order |
| `docs/01-architecture.md` | New — two-phase spine, `Analysis` contract artifact, package layout |
| `docs/07-build-plan.md` | New — v1 DoD + M0 through M7 milestones |
| `docs/99-open-questions.md` | New — deferred decisions with resolution triggers |
| `scripts/new-version.sh` | New — versioning ceremony script |
| `infra/terraform/README.md` | New — AWS deployment placeholder |
| `Versions/v0/v0.0.0/release-notes.md` | New — this file |
