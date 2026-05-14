# v1.0

## v1.0.1 — Fix BSD awk in new version script (2026-05-14)

### Problem

`scripts/new-version.sh` used `awk -v stub="$stub"` to inject the new patch's H2 heading into the existing minor's `release-notes.md`. BSD awk (the macOS default) rejects multi-line values passed to `-v` with `awk: newline in string`. Every patch bump this cycle (v0.7.6 → v0.7.7 → v0.7.8 → this one) hit the bug. The branch was always created successfully; only the stub-prepend failed, and the workaround was to hand-prepend the H2 by Edit-ing the file.

The fix has been deferred PR-after-PR ("not a blocker, do it in its own version"). Now that v1.0.0 has shipped, it's the natural first post-v1 patch.

### Solution

Drop the `awk -v stub="$stub"` invocation. Replace it with a `grep` + `head` + `tail` splice:

1. Find the line number of the first existing H2 heading (`grep -n -E '^## v[0-9]+\.[0-9]+\.[0-9]+' | head -1 | cut -d: -f1`).
2. Splice the file: `head -n $((line - 1))` for everything above the existing H2, then `printf '%s\n\n' "$stub"` for the new stub + blank-line separator, then `tail -n +${line}` for everything from the first H2 onward.
3. Replace the original with the spliced temp file.

No awk, no `-v` flag, no multi-line shell-variable handoff. Pure POSIX shell + `grep -E`, both of which behave identically on BSD and GNU.

Added a guard: if no H2 heading is found, the script now exits with a clear error rather than silently producing an unmodified file (the prior behavior under the awk path was to print the original unchanged).

### Verification

Manual splice test against a synthetic fixture (`v0.9.1` → splice in `v0.9.2`) and against a copy of the live `Versions/v1/v1.0/release-notes.md` (splice in a `v1.0.2` test stub). Both produced the correct structure: H1 preserved, new H2 inserted with a trailing blank line, existing H2s preserved in order. The bug was reproducible against the pre-fix script (hit on the v1.0.1 scaffolding for this very PR — last manual workaround).

Production verification will happen the next time `./scripts/new-version.sh` is run for a patch bump. If it injects cleanly without the `awk: newline in string` error, the fix is good.

### New

Nothing new.

### Changed

- `scripts/new-version.sh` — replaced the `awk -v stub="$stub"` block (15 lines) with a `grep` + `head` + `tail` splice (14 lines including the missing-H2 guard). Updated the inline comment to explain why awk was avoided.

### Fixed

- BSD-awk crash when prepending a new H2 stub. Described in Problem.

### Files Changed

| File | Change |
|------|--------|
| `scripts/new-version.sh` | Replace the buggy awk-based prepend block with a portable `grep`+`head`+`tail` splice. Add a missing-H2 guard. |
| `Versions/v1/v1.0/release-notes.md` | This file. |

## v1.0.0 — v1 Ship (2026-05-14)

**webspec v1 ships.** A browser-based shift-left companion for web app development. The Chrome extension records a user's workflow and audits the page for Section 508 / WCAG issues; the CLI renders the recording into a runnable Playwright spec with positive AND negative scenarios (LLM-amplified). Short feedback loops — catch problems while you're building, not after.

### Why webspec

A typical web-app test cycle puts a11y audits, recorded user flows, and end-to-end coverage on the *right* side of the lifecycle: scheduled scans, contractor reviews, QA cycles after the build is "done." By the time a finding surfaces, the relevant code is days or weeks behind, the context is gone, and the fix carries integration cost. **The shift-left bet is that the same audits and the same recordings, run *on the live page* the developer is looking at right now, change the economics of fixing.**

Three constraints shaped what v1 is:

- **Browser-first.** The Chrome extension is the flagship surface. Developers, QA, designers, 508 reviewers, and PMs all use Chrome — nobody needs to leave it to use webspec. The CLI exists for CI gating; the IDE surface is intentionally post-v1.
- **Deterministic by default, LLM-amplified when configured.** The audit (axe-core) and the recorder are fully deterministic. The renderer's happy-path output is deterministic. LLM amplification — negative scenarios, assertion suggestions, test naming — is opt-in via `--provider`. v1 emits a complete Playwright spec with zero LLM credentials configured.
- **One contract artifact.** `Analysis` (zod-validated, discriminated union: `TestPlan`, `A11yReport`, `WorkflowRecording`) is the spine. Every module produces or consumes it. Subsystems are pure functions over the contract. Re-rendering, re-amplifying, and round-trip testing are first-class because of this shape.

### What v1 ships

**Chrome extension** (`packages/chrome-extension/`, MV3, React popup):

- **Audit this tab.** Injects the browser flavor of `axe-core`; runs on demand from the popup; renders findings severity-grouped with rule tags, selectors, and fix hints. **Copy report** drops the same `A11yReport` as Markdown on the clipboard.
- **Record.** Captures `click`, `input`, `change`, `submit`, `keydown`, and navigation events with hardened selectors (`data-testid` > role+name > text > CSS fallback) computed at capture time. Passwords are masked. Recording state survives popup close (`chrome.storage.session`). Stop → review the trace summary → **Download recording.json** writes a typed `WorkflowRecording` via `chrome.downloads`.

**CLI** (`packages/cli/`, `webspec` binary):

- `webspec audit <url> [--format md|json] [--out <path>]` — Node-mode axe-core via `@axe-core/puppeteer`; identical rule set to the extension (`wcag21aa + section508 + best-practice`); emits the same `A11yReport` shape so report parity across surfaces is a type check, not a hope.
- `webspec record-to-spec <recording.json> [--out <path>] [--test-name <name>] [--provider <name>]` — two-pass renderer. Deterministic pass emits the recorded happy path as a single `test()` block. With `--provider bedrock`, the LLM amplification pass adds negative scenarios (invalid input, empty fields, error states) as additional `test()` blocks, plus assertions and test naming. **The LLM emits a typed `AmplifiedRecording` (zod-validated at the seam); a deterministic renderer formats that into Playwright source.** The LLM never writes shipped Playwright code directly.

**Core library** (`packages/core/`):

- `Analysis` contract artifact (`TestPlan`, `A11yReport`, `WorkflowRecording`) — zod schemas + inferred types.
- `LLMProvider` interface, vendor-neutral. `BedrockAdapter` is v1's implementation (Anthropic models via `@anthropic-ai/bedrock-sdk`, standard AWS credential chain). Adding a second adapter is a code change scoped to one new file.
- `A11yAnalyzer` (Node + browser modes), `ReportRenderer`, `TestPlanAnalyzer` (Angular 19+ standalone, M2 foundation), `AmplifyAnalyzer`, deterministic + amplified Playwright renderers.

**Reference recordings** (`tests/fixtures/recordings/three-sites/`):

- `example.com`, `react.dev`, `demo.playwright.dev/todomvc/`. Render to passing Playwright specs against the live URL — the v1 DoD's three-site verification, committed for reproducibility.

**Operator quickstart** (`README.md`): six steps from `git clone` to a passing Playwright run against a live site.

### Architecture at a glance

```
┌────────────────────┐                ┌────────────────────┐
│  Chrome extension  │                │       CLI          │
│  (audit + record)  │                │  (audit + render)  │
└──────────┬─────────┘                └──────────┬─────────┘
           │                                     │
           │   produces / consumes               │
           ▼                                     ▼
       ┌───────────────────────────────────────────────┐
       │   Analysis  (TestPlan | A11yReport |          │
       │              WorkflowRecording) — zod schemas │
       └───────────────────────────────────────────────┘
           ▲                                     ▲
           │                                     │
┌──────────┴────────────┐         ┌──────────────┴─────────────┐
│  Analyzers            │         │  Renderers                 │
│  - A11yAnalyzer       │         │  - ReportRenderer (MD/JSON)│
│  - AmplifyAnalyzer    │ ◀──────│  - Playwright (det+ampl)   │
│    (uses LLMProvider) │         │  - Jest (M2 foundation)    │
└───────────────────────┘         └────────────────────────────┘
                  ▲
                  │
       ┌──────────┴──────────────┐
       │  LLMProvider interface  │
       │  └─ BedrockAdapter (v1) │
       └─────────────────────────┘
```

Every arrow is typed through the `Analysis` contract. No vendor SDK is imported outside its adapter module.

### Verification

- **Three deployed sites** — audit parity (`v0.6.0`) and render-to-spec (`v0.7.6`) verified end-to-end on `example.com`, `react.dev`, `demo.playwright.dev/todomvc/`. All rendered specs pass against the live URL.
- **Test suite** — 233+ tests across `packages/core`, `packages/cli`, and `packages/chrome-extension`, including the hermetic v0.7.3 integration test that renders + runs Playwright headlessly against a local fixture.
- **Manual smoke** — full six-step quickstart walked through against `example.com` on 2026-05-14: install ext, audit, record, render, run, all green.

### What's intentionally NOT in v1

These are explicit scope cuts, not gaps. Each has documented rationale in `docs/07-build-plan.md` or `docs/99-open-questions.md`:

- **`webspec gen` (unit-test generation from source)** — the M2 `TestPlanAnalyzer` + Jest renderer foundation ships in the codebase but the CLI surface is deferred. M2's intermediate representation is reusable by the M6 amplifier (same `cases[]` shape with arrange/act/assert), which is what made keeping it worthwhile. The save-time-watcher productization is post-v1.
- **VS Code extension (M7)** — browser-first means browser-only in v1. The IDE surface is a natural next-quarter target if a user pulls it.
- **Second LLM adapter (M8)** — the `LLMProvider` seam is proven structurally; adding a second adapter is one new file. Deferred until a customer-procurement constraint forces it (e.g. self-hosted, OpenAI-compatible, Vertex).
- **Network capture + replay (M12)** — `WorkflowRecording.network: NetworkEvent[]` stays in the zod schema as a forward-compat seam, but the recorder emits `[]` and neither renderer pass consumes it. Picked up when recorded mocks become a meaningful use case.
- **Karma + Jasmine emitter, Cypress renderer, in-extension playback + visual diff, coverage feedback loop, GitHub Action surface, Bellese LLM proxy** — all listed in the commented-out post-v1 milestones at the bottom of `docs/07-build-plan.md`. Each is plausible; none gated v1.

### The path here

| Version | Title | Shipped |
|---------|-------|---------|
| `v0.1.0` | Foundations | Monorepo, build, Docker, versioning ceremony |
| `v0.2.0` | Contract artifact + LLM provider seam | `Analysis` zod schemas + `LLMProvider` + `BedrockAdapter` |
| `v0.3.0` | TestPlan analyzer + Jest renderer (M2 foundation) | Angular parser + prompt + renderer + goldens |
| `v0.3.5` | M4 CLI audit | `webspec audit` end-to-end |
| `v0.3.7`–`v0.4.2` | Chrome extension flagship (audit mode) | MV3 scaffold + popup UI |
| `v0.5.0`–`v0.5.4` | Chrome extension recorder | DOM events, hardened selectors, dedup, session persistence, navigation, masking, review-then-download |
| `v0.6.0` | M5 closed | Three-site audit parity verified |
| `v0.6.2` | M6 design | `docs/06-renderer.md` locked the renderer scope |
| `v0.7.0`–`v0.7.4` | M6 implementation | Deterministic renderer + IR + amplifier + integration test + amplification golden |
| `v0.7.6` | Three-site render verification | Live-URL Playwright runs against the three reference recordings |
| `v0.7.7` | README quickstart | Operator-facing six-step walkthrough |
| `v0.7.8` | v1 DoD box tick | Doc-truth: every DoD checkbox `[x]` with shipping version |
| **`v1.0.0`** | **v1 Ship** | **This release.** |

### Changed (in this version)

No new code lands in `v1.0.0` — the work is the writeup. Two doc edits accompany the ship:

- `docs/07-build-plan.md` — adds a "v1 ships at v1.0.0 (2026-05-14)" banner at the top of the v1 DoD section so the doc reads as a shipped artifact rather than a forward checklist. The DoD itself is preserved as a historical record (every box `[x]` with version footprints from v0.7.8).
- `README.md` — Status section updated: removes the "v1 ships once the remaining DoD boxes are ticked" forward-looking line; replaces with a one-liner stating v1 has shipped at `v1.0.0` and pointing at the v1.0.0 release notes for the full announcement.

### Files Changed

| File | Change |
|------|--------|
| `Versions/v1/v1.0/release-notes.md` | New — this release announcement. |
| `docs/07-build-plan.md` | Add "v1 ships at v1.0.0 (2026-05-14)" banner above the v1 DoD section. |
| `README.md` | Status section: v1 has shipped; point at v1.0.0 release notes. |

### Known issues (not blockers; deferred to `v1.0.1+`)

- `scripts/new-version.sh` fails to inject the H2 stub on BSD awk (macOS) for patch bumps. The branch creation still succeeds; the stub is reconstructed manually. Hit every patch this cycle. The major bump that created this file used the create-path (no awk involved) and worked cleanly. Worth fixing in `v1.0.1` — switch from `awk -v stub="$stub"` to piping the stub via stdin, or require GNU awk.

### What's next (post-v1)

The commented-out section at the bottom of `docs/07-build-plan.md` lists the candidate post-v1 milestones in rough priority order. The natural first patches after `v1.0.0`:

1. `v1.0.1` — fix the BSD-awk bug in `new-version.sh`.
2. `v1.1.x` — reactivate as needed: M3 (`webspec gen` watcher), M7 (VS Code), M8 (second LLM adapter), M11 (in-ext playback), M12 (network capture).

What gets prioritized next is **driven by what an actual user wants**. v1 is the shippable surface; v1.1+ is the conversation.
