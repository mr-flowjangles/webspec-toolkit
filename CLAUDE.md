# webspec

**webspec** — a browser-based shift-left companion for web app development. The Chrome extension records a user's workflow, audits the page for Section 508 / WCAG issues, and renders the recording into a runnable Playwright spec with positive AND negative scenarios (LLM-amplified). The whole point is short feedback loops — catch problems while you're building, not after.

## Current state

**v1 has shipped.** All v1-path milestones are done — M0 foundations (v0.1.0), M1 `Analysis` contract artifact + `LLMProvider` seam with `BedrockAdapter` (v0.2.0), M2 Angular `TestPlan` analyzer + Jest renderer (v0.3.0), M4 a11y analyzer + report renderer (v0.3.3–v0.3.9), M5 Chrome extension audit + recorder with hardened selectors, dedup, session persistence, navigation capture, review-gated download (v0.4.x–v0.6.0), and M6 `WorkflowRecording` → Playwright renderer with LLM amplification (v0.7.0–v0.7.4). v1.0.0 cut on 2026-05-14.

**Live on `main` (v1.3.0):** v1.1.0 user-supplied test name + description + dual-file Save; v1.1.1 `.spec.ts` MIME fix; v1.1.2 test-library design doc (`docs/08-test-library.md`); v1.2.0 on-disk test library at `~/Downloads/webspec/<slug>/` with parent `playwright.config.ts` discovered by Playwright UI via `make run-tests`; v1.3.0 domain-aware auth profiles (new ⚙ Settings tab managing `AuthProfile`s — name + URL glob + N header rows with `${runAs}` substitution — stored in `chrome.storage.local`; popup matches the active tab URL at record-start; resolved headers baked into `WorkflowRecording.auth` and emitted as `await context.setExtraHTTPHeaders({ ... })`, same mechanism as ModHeader). Also in v1.3.0: selector hardening — clicks landing on decorative descendants of interactive elements (mat-icon inside `[role=menuitem]`, etc.) now promote up to the nearest interactive ancestor, replacing brittle `div.nth(369)` selectors with stable `getByRole(...)`. The extension is the authoring surface; Playwright UI is the see-and-execute surface (we deliberately don't build an in-extension library list — see [[m1-3-pivot]] in memory).

**The unit-test-from-source path (M2) stays in the codebase as foundation but is deferred from the v1 active path** — the v1 mission is shift-left + fail-fast on a live page, not productivity tooling for hand-writing unit tests. M3 (CLI for unit-test gen) and M7 (VS Code) deferred from v1.

**Next milestone — v1.4 Queues + Team Shareability (designed in `docs/10-team-shareability.md`).** Mission expanded mid-v1.3: tests must be runnable by teammates and CI, not just the recorder. New product shape locked 2026-05-16 — recordings become reusable **Test Cases**, composed into **Queues** (ordered runs with per-step roles, optional inputs, iteration counts). One Queue → one `.spec.ts` shipped to a per-app team repo (`ucm-tests`, etc.). MVP inlines Test Case bodies (no reuse yet); v1.5+ activates reuse + AI variation amplification. `docs/10` supersedes the old "v1.4 — Suites" entry in `docs/08`.

## How to read this repo

1. Start with `docs/00-overview.md` for the elevator pitch and scope.
2. `docs/01-architecture.md` is the spine — module map and the contract artifact between modules.
3. Subsystem deep-dives (`02-` through `06-`) cover individual concerns. Add them as the architecture firms up.
4. `docs/07-build-plan.md` is the **implementation checklist** — milestones in order, boxes to tick as we go.
5. `docs/08-test-library.md` is the **post-v1 design** for v1.2 (on-disk test library + Playwright UI as the run surface), v1.3 (auth injection via ModHeader-equivalent headers), and v1.4 (suites).
6. `docs/99-open-questions.md` tracks decisions explicitly deferred from v1.

## Working norms for this project

- **Design before code.** Decisions are aligned in conversation, recorded in `docs/`, then implemented. Don't write code that contradicts a doc — update the doc first.
- **The build plan is authoritative.** `docs/07-build-plan.md` is the order of work and the source of truth for "are we done." Tick boxes as tasks land. Do not start a new milestone before the previous one's "Done when" is true.
- **Surfacing unanticipated decisions.** If implementation reveals a question the design didn't answer, _stop coding_, update the relevant doc (or `99-open-questions.md`), then resume. No silent decisions in code.
- **The contract artifact is the spine.** Identify in `01-architecture.md` the one canonical intermediate representation that every module produces or consumes. When in doubt, route through it.

## Versioning

Every PR is a version. Three-part semver, one stacked release-notes file per **minor** under `Versions/`.

```
Versions/
└── v{major}/
    └── v{major}.{minor}/
        └── release-notes.md     # newest patch at top, oldest at bottom
```

Each minor file is structured as:

```
# v{major}.{minor}

## v{major}.{minor}.{patch} — Title (YYYY-MM-DD)   ← newest at top
### Problem
### Solution
### New / Changed / Fixed / Files Changed

## v{major}.{minor}.{patch-1} — …
…
```

**Start a new version:**

```
./scripts/new-version.sh "Short Description"        # patch bump (default)
./scripts/new-version.sh --minor "Short Description"
./scripts/new-version.sh --major "Short Description"
./scripts/new-version.sh --dry-run "Short Description"
```

The script:

1. Refuses to run on a dirty working tree.
2. Finds the latest version by scanning H2 headings (`## v{maj}.{min}.{pat} …`) across `Versions/v*/v*/release-notes.md`, bumps it.
3. Creates a branch named `V{major}dot{minor}dot{patch}/{Description_With_Underscores}`.
4. **Patch bump** → prepends a new H2 stub at the top of the existing minor's file (just under the H1). **Minor / major bump** → creates a new `Versions/v{major}/v{major}.{minor}/release-notes.md` with the H1 + first H2 stub.
5. You fill in the notes as you implement, commit alongside the code, open a PR.

The Makefile has shortcuts:

```
make version                          # patch bump (interactive prompt)
make version DESC="Short Description" # patch bump (one-shot)
make version-minor DESC="..."         # minor bump
make version-major DESC="..."         # major bump
make version-M1                       # minor bump, title auto-resolved from docs/07-build-plan.md
```

**Bump conventions for this project:**

- **Patch** — most PRs (a single milestone task, a bug fix, a small refinement).
- **Minor** — completion of a milestone (M0, M1, etc. in `docs/07-build-plan.md`).
- **Major** — `v1.0.0` is the v1 Definition of Done. Don't bump major casually.

**v0** is the pre-release line — design and foundations. We move to **v1.0.0** when the v1 Definition of Done at the top of `docs/07-build-plan.md` is fully checked.

### PR rules

- **PR title must be `v{version} — {short description}`**, matching this patch's H2 heading in the minor's `release-notes.md` (minus the date suffix). Example: `v0.0.1 — Versioning Bootstrap`. The version number makes the PR list scannable as a release log.
- **Rob initiates PRs.** Claude creates the branch (via `new-version.sh`) and fills in the release notes during implementation, but does **not** push the branch or run `gh pr create` until Rob explicitly says so ("open the PR" / "create the PR"). Local commits are fine.

## Tech choices (locked)

- **Language:** TypeScript across all packages.
- **Monorepo:** pnpm workspaces (no Nx/Turbo for v1).
- **Test framework target (the one we generate):** Jest. Karma + Jasmine deferred — see `docs/99-open-questions.md`.
- **Angular baseline:** 19+ standalone components (Bellese projects are on Angular 20).
- **A11y engine:** axe-core with `wcag21aa` + `section508` rule tags.
- **LLM:** Anthropic models via **Amazon Bedrock** with the standard AWS credential chain (env / `~/.aws/credentials` / IAM role). Vendor-neutral `LLMProvider` interface in `packages/core/src/llm/`; v1 ships `BedrockAdapter`. **No vendor/cloud SDK may be imported outside its adapter module.**
- **Surfaces:** CLI (`packages/cli`), VS Code extension (`packages/vscode-extension`), Chrome extension (`packages/chrome-extension`) — all on shared `core`.
- **Deployment:** Docker image for the CLI; AWS via Terraform (`infra/terraform/`) reserved for future team-shared services (no v1 deployment).
