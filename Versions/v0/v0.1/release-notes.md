# v0.1

## v0.1.2 — Add Workflow Recorder + Playwright e2e Path (2026-05-07)

### Problem

The build plan generated tests from source code only — `.component.ts` → Jest `.spec.ts`. That covers unit-level correctness, but does nothing for the workflows customers actually use, and does nothing for the audience (QA, designers, 508 reviewers, PMs) who can't read source. The Chrome extension, currently scoped to a11y scans, had untapped potential as the surface those non-developers _can_ use to produce tests — by recording themselves using the app.

### Solution

Add a third capability: **runtime workflow recording → Playwright e2e tests**. Scope expansion, not a refinement. Doc-only PR; code work flows from M5 onward.

The Chrome extension grows two modes (audit + recorder). The recorder captures a deterministic event trace — clicks, form fills, navigation, key events, outgoing network requests — with hardened selectors computed at capture time (`data-testid` > role+name > text > css). The recording exports as JSON. A new e2e renderer in `core/render/` translates the recording into Playwright `.spec.ts` (deterministic pass), with an optional LLM polish pass that names the test, inserts assertions, and consolidates selectors. The renderer works without an LLM — polish is opt-in.

The `Analysis` contract artifact gains a third variant: `WorkflowRecording`, alongside `TestPlan` and `A11yReport`. M1 expands to lock all three variants together.

### New

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

### Changed

- Future-milestones comment in the build plan renumbered (Karma+Jasmine → M9, Cypress renderer → M10, in-extension replay → M11, network-response capture → M12, etc.).
- **Out-of-scope list** in mission.md added: Cypress emitter, in-extension recording playback, network-response mocking. **Removed** "E2E test generation" since it's now in scope.
- "Test framework target: Jest" in mission.md → split into "Unit-test framework target: Jest" and "E2E framework target: Playwright."

### Fixed

- (n/a)

### Files Changed

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

## v0.1.1 — Front-load Chrome ext + CLI init (2026-05-07)

### Problem

The build plan as written treats "easy to use" as something each surface earns independently. But "easy" has two audiences with very different floors: developers (who can fall back to the CLI) and non-developers — 508 reviewers, QA, designers, PMs — who cannot. The Chrome extension is the only surface that admits the second audience. Sequencing it after the VS Code extension means the lowest-floor surface lands last, when it should arguably be the showcase. Separately, the CLI in M3 has no onboarding step — a new user has to know about three install URLs, write a config file by hand, and figure out where to put their LLM key.

### Solution

Two refinements to `docs/07-build-plan.md`, no code changes:

1. **Swap M5 and M6.** Chrome extension becomes M5 (front-loaded as the flagship "easy to use" surface); VS Code extension becomes M6. Dependencies still resolve cleanly — Chrome only needs `core` + the `A11yAnalyzer` from M4, no VS Code work in between.
2. **Add `bellese-test init` to M3.** Single command that detects the Angular project, drops a sane `bellese-test.config.json`, prompts once for LLM provider + key (stored via OS keychain), and prints install URLs for the Chrome and VS Code extensions. Idempotent so re-running is safe.

Knock-on edits to keep the milestone numbers consistent: `docs/99-open-questions.md` (the Manifest V3 question's resolution trigger now points to M5), and the milestone numbers in the chrome- and vscode-extension package stub comments.

### New

- **`bellese-test init` task** added to M3 — onboarding wizard. Detects Angular project, writes config, prompts for LLM provider + key via OS keychain, prints extension install URLs.
- **Reasoning in the M5 heading** — "the flagship 'easy to use' surface" — captures _why_ Chrome went first so a future reader doesn't reorder it back.

### Changed

- **`docs/07-build-plan.md`.** M5 = Chrome extension; M6 = VS Code extension. M3 gained the `init` task and an updated "Done when" criterion.
- **`docs/99-open-questions.md`.** The Manifest V3 service-worker question's resolution trigger updated from "M6 implementation" to "M5 implementation".
- **`packages/chrome-extension/src/index.ts`.** Stub comment now says M5.
- **`packages/vscode-extension/src/index.ts`.** Stub comment now says M6.

### Fixed

- (n/a)

### Files Changed

| File | Change |
| ---- | ------ |
| `docs/07-build-plan.md` | Changed — swapped M5/M6 ordering; added M3 `init` task + updated done-when |
| `docs/99-open-questions.md` | Changed — Manifest V3 resolution trigger updated to M5 |
| `packages/chrome-extension/src/index.ts` | Changed — stub comment now references M5 |
| `packages/vscode-extension/src/index.ts` | Changed — stub comment now references M6 |
| `Versions/v0/v0.1.1/release-notes.md` | New — this file |

## v0.1.0 — Foundations (2026-05-07)

### Problem

The v0.0.0 commit locked the design but had no toolchain. To start M1 (Analysis contract artifact + LLMProvider seam) we need a buildable monorepo: TypeScript project references, lint/format/test wiring, a runnable Docker image, and per-package skeletons that the milestone work can fill in without re-debating layout.

### Solution

Ship the M0 build-plan milestone in full: a pnpm workspace with five packages (`core`, `cli`, `vscode-extension`, `chrome-extension`, `config`), TypeScript project references for incremental builds, ESLint flat config with `typescript-eslint`, Prettier, Vitest at the root, a multi-stage Node 20 Dockerfile that builds the workspace and ships a slim CLI runtime, and Make targets driven by pnpm. Stub `index.ts` per package keeps `tsc -b` clean while feature code is deferred to its milestone.

### New

- **Workspace root.** `package.json` (pnpm 9.12.3 + Node ≥20 pinned via `engines` and `packageManager`), `pnpm-workspace.yaml`, `.nvmrc` (Node 20), `tsconfig.base.json`, root `tsconfig.json` aggregating project references.
- **Five packages, all stub-level:**
  - `@bellese/test-core` — shared analyzer + renderer + LLM seam (M1+).
  - `@bellese/test-config` — config schema + Angular project auto-detection (M3).
  - `@bellese/test-cli` — `bellese-test` binary; M0 stub responds to `--help` and exits with the implementation roadmap.
  - `@bellese/test-vscode-extension` — VS Code surface (M5).
  - `@bellese/test-chrome-extension` — Manifest V3 surface (M6); tsconfig forces a browser-shaped build (DOM lib, no Node types) from M0.
- **Lint + format + test toolchain.** ESLint 9 flat config with `typescript-eslint`, Prettier 3 (single quotes, trailing commas, 100-col), Vitest 2 with `passWithNoTests` so empty suites don't fail CI.
- **Multi-stage Dockerfile.** Node 20 alpine, pnpm via corepack, two stages: install + build, then a slim runtime that runs `node /app/packages/cli/dist/index.js`. `make image` + `make smoke` validate the pipeline.
- **Versioning ceremony validated.** Bootstrap commit `v0.0.0 — Initial Design` on `main`; `make version-M0` created `V0dot1dot0/Foundations` branch and this `Versions/v0/v0.1.0/release-notes.md`.

### Changed

- **Makefile.** Replaced the `setup`/`test`/`lint`/`format` TODO stubs with pnpm-driven targets; added `build`, `format-check`. `clean` now removes `dist/`, `node_modules/`, and `.tsbuildinfo` artifacts.
- **Dockerfile.** Replaced the `alpine:3.20` placeholder with the multi-stage Node 20 build described above.
- **`.gitignore`.** Excludes `.claude/settings.local.json` (per-machine Claude Code settings).
- **`docs/07-build-plan.md`.** All M0 boxes ticked; the bullet wording was updated to match what was actually built (e.g. root pnpm scripts rather than `pnpm -r run <name>`).
- **`CLAUDE.md` / `README.md` Status sections.** No longer "design phase" — M0 complete; M1 is next. README gained a Quickstart block.

### Fixed

- (n/a — first feature commit on this branch.)

### Files Changed

| File | Change |
| ---- | ------ |
| `package.json` | New — root workspace, scripts, dev deps, packageManager pin |
| `pnpm-workspace.yaml` | New — workspace globs |
| `.nvmrc` | New — Node 20 |
| `tsconfig.base.json` | New — strict TS config shared by packages |
| `tsconfig.json` | New — root project-references aggregator |
| `eslint.config.mjs` | New — flat config with typescript-eslint |
| `.prettierrc.json` | New — formatter config |
| `.prettierignore` | New — formatter ignores |
| `vitest.config.ts` | New — Vitest at root with `passWithNoTests` |
| `packages/core/{package.json,tsconfig.json,src/index.ts}` | New — stub package |
| `packages/config/{package.json,tsconfig.json,src/index.ts}` | New — stub package |
| `packages/cli/{package.json,tsconfig.json,src/index.ts}` | New — CLI stub responds to `--help` |
| `packages/vscode-extension/{package.json,tsconfig.json,src/index.ts}` | New — stub package |
| `packages/chrome-extension/{package.json,tsconfig.json,src/index.ts}` | New — browser-shaped tsconfig (DOM lib, no Node types) |
| `Makefile` | Changed — pnpm-driven targets |
| `Dockerfile` | Changed — multi-stage Node 20 CLI build |
| `.gitignore` | Changed — exclude `.claude/settings.local.json` |
| `docs/07-build-plan.md` | Changed — M0 boxes ticked, wording aligned with implementation |
| `CLAUDE.md` | Changed — Status section reflects M0 complete; minor prettier reflow |
| `README.md` | Changed — Status + Quickstart; repo layout updated to monorepo |
| `Versions/v0/v0.1.0/release-notes.md` | New — this file |

