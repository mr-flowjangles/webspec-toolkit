# v0.1.2 — Add Workflow Recorder + Playwright e2e Path (2026-05-07)

## Problem

The build plan generated tests from source code only — `.component.ts` → Jest `.spec.ts`. That covers unit-level correctness, but does nothing for the workflows customers actually use, and does nothing for the audience (QA, designers, 508 reviewers, PMs) who can't read source. The Chrome extension, currently scoped to a11y scans, had untapped potential as the surface those non-developers _can_ use to produce tests — by recording themselves using the app.

## Solution

Add a third capability: **runtime workflow recording → Playwright e2e tests**. Scope expansion, not a refinement. Doc-only PR; code work flows from M5 onward.

The Chrome extension grows two modes (audit + recorder). The recorder captures a deterministic event trace — clicks, form fills, navigation, key events, outgoing network requests — with hardened selectors computed at capture time (`data-testid` > role+name > text > css). The recording exports as JSON. A new e2e renderer in `core/render/` translates the recording into Playwright `.spec.ts` (deterministic pass), with an optional LLM polish pass that names the test, inserts assertions, and consolidates selectors. The renderer works without an LLM — polish is opt-in.

The `Analysis` contract artifact gains a third variant: `WorkflowRecording`, alongside `TestPlan` and `A11yReport`. M1 expands to lock all three variants together.

## New

- **Mission statement** updated: three capabilities (unit tests / a11y / e2e), audience explicitly includes non-developers, Playwright locked as the v1 e2e framework target.
- **Overview** rewritten: three-input flow diagram, expanded v1 scope, new CLI command (`bellese-test record-to-spec <recording.json>`), expanded north-star (Cypress renderer, in-extension replay, response-mocking).
- **Architecture** gains a third Phase 1 analyzer (`WorkflowRecorder`, browser-only) and a third Phase 2 renderer (`E2ERenderer`, two-pass deterministic + LLM polish). The `Analysis` contract artifact is now a three-arm discriminated union; sketch in `01-architecture.md` updated to include `WorkflowRecording`, `RecordedEvent`, and `HardenedSelector` types. File layout expanded to show `analyze/test-plan/`, `analyze/a11y/`, `analyze/recorder/`. Subsystem-responsibilities table updated. Two new architectural non-goals: in-extension replay and network-response capture, both deferred to v2.
- **Build plan** restructured:
  - **M5** (Chrome extension) expanded to two modes — audit + recorder. New tasks for event capture, selector hardening at capture time, network capture via `webRequest`, password masking, JSON export via `chrome.downloads`. Verification on three Bellese sites covers both audit and recorder flows.
  - **M6 (new)** — E2E renderer. Deterministic pass + LLM polish pass. Adds `bellese-test record-to-spec` to the CLI.
  - **M7** (was M6) — VS Code extension. Gains a third command: render an existing recording into a Playwright spec. Recorder itself stays out of VS Code — there's no live tab.
  - **M8** (was M7) — Second LLM adapter. Parity test now covers both `TestPlan` polish and `WorkflowRecording` polish.
  - **v1 Definition of Done** gains an e2e bullet and a Chrome-extension-recorder bullet.
- **Open questions** gained five new entries: Cypress renderer timing, recorder selector-hardening priority, recording transport from Chrome to Node, secret/PII masking policy, and in-extension replay. Two are leaning-resolved with M5 spike as the resolution trigger.
- **Stub comments** in `packages/chrome-extension/src/index.ts` and `packages/vscode-extension/src/index.ts` updated to reflect the new milestone numbers and scope.

## Changed

- Future-milestones comment in the build plan renumbered (Karma+Jasmine → M9, Cypress renderer → M10, in-extension replay → M11, network-response capture → M12, etc.).
- **Out-of-scope list** in mission.md added: Cypress emitter, in-extension recording playback, network-response mocking. **Removed** "E2E test generation" since it's now in scope.
- "Test framework target: Jest" in mission.md → split into "Unit-test framework target: Jest" and "E2E framework target: Playwright."

## Fixed

- (n/a)

## Files Changed

| File | Change |
| ---- | ------ |
| `docs/mission.md` | Changed — third capability, Playwright locked, audience expanded, out-of-scope updated |
| `docs/00-overview.md` | Changed — three-input flow, expanded v1 scope, new CLI command, north-star expansion |
| `docs/01-architecture.md` | Changed — `WorkflowRecorder` + `E2ERenderer` modules, three-arm `Analysis` union with `WorkflowRecording` / `RecordedEvent` / `HardenedSelector` types, file layout expanded, subsystem table updated, non-goals expanded |
| `docs/07-build-plan.md` | Changed — v1 DoD adds e2e bullets; M1 includes `WorkflowRecording`; M5 expands to audit+recorder; new M6 (E2E renderer); M7 = VS Code (was M6); M8 = second LLM adapter (was M7); future-milestones renumbered |
| `docs/99-open-questions.md` | Changed — five new entries (Cypress timing, selector hardening, recording transport, masking policy, in-extension replay) + one note about response capture |
| `packages/chrome-extension/src/index.ts` | Changed — stub comment reflects new M5 scope (audit + recorder) |
| `packages/vscode-extension/src/index.ts` | Changed — stub comment reflects M7 (was M6) and explains why recorder doesn't live here |
| `Versions/v0/v0.1.2/release-notes.md` | New — this file |
