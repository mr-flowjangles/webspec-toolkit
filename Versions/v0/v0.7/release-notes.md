# v0.7

## v0.7.8 — v1 DoD Box Tick (2026-05-14)

### Problem

Every v1 Definition of Done line item in `docs/07-build-plan.md` was factually true after v0.7.7 — but six of the seven DoD checkboxes were still `[ ]`. The doc was lying about ship-readiness by omission: every box was deliverable, but no human reading the doc would know that without diffing it against the version history.

There was also one DoD bullet that had drifted out of sync with what M5 actually shipped:

> "Record" captures a workflow (clicks, input, change, submit, navigation, key events, **outgoing requests**) with hardened selectors…

M5 (v0.5.x → v0.6.0) deliberately carved network capture out of v1. The decision is documented in M5's section header (~~strikethrough~~ on the `webRequest`-listener bullet, with "**Out of v1**" rationale) and in `docs/99-open-questions.md` (deferred to M12). But the DoD bullet at the top of the file was never updated to match the milestone-level scope cut — so a reader would scan the DoD, look for the network-capture deliverable in the shipped code, not find it, and assume something was missing.

The major-version bump to `v1.0.0` should land against a build plan that's honest about both what shipped and what didn't. So before the bump, the DoD checklist needs to be ticked truthfully — and the one out-of-sync line needs to be reconciled with the scope decision M5 actually made.

### Solution

Doc-only sweep. Two changes:

**1. Tick every v1 DoD checkbox**, with the version each deliverable shipped in:

| DoD line | Shipped | Notes |
|----------|---------|-------|
| Chrome extension installs and runs (two modes) | M5 done at v0.6.0 | — |
| → "Audit this tab" 508/WCAG 2.1 AA report | v0.3.8 (browser-mode injection) + v0.4.0–v0.4.2 (popup UI) | — |
| → "Record" captures workflow + hardened selectors + chrome.downloads export | v0.5.0–v0.5.4 | Network capture explicitly OOS (see below). |
| Recording → Playwright with positive + negative scenarios | M6 done at v0.7.4 | Deterministic v0.7.0, IR v0.7.1, amplifier v0.7.2, integration test v0.7.3, golden v0.7.4. |
| Thin CLI for CI integration (`webspec audit` + `webspec record-to-spec`) | v0.3.5 + v0.7.0 (+ v0.7.2 for `--provider`) | — |
| LLM access via AWS Bedrock | M1 at v0.2.0 | `LLMProvider` interface; one adapter (`BedrockAdapter`); adding a second adapter is a single new file. |
| Verified on three deployed sites | v0.6.0 audit-parity + v0.7.6 render-to-spec | example.com / react.dev / TodoMVC, both halves covered. |
| All milestones M4–M6 checked | M4 v0.3.6, M5 v0.6.0, M6 v0.7.4 | — |
| README quickstart end-to-end | v0.7.7 | Already ticked. |

**2. Reconcile the "Record" bullet with M5's scope decision.** Removed `outgoing requests` from the captured-event list in the DoD bullet. The full event list is now `(clicks, input, change, submit, navigation, key events)`, with a trailing parenthetical: *"Network capture explicitly out of v1 per M5 below; the schema seam remains for the deferred M12."*

Three reasons this is the right reconciliation rather than silent removal:

- M5's body already strikes through the network-capture work-item and labels it "Out of v1." The DoD bullet was the only line in the file that still implied it was in scope.
- `WorkflowRecording.network: NetworkEvent[]` stays in the zod schema (recording emits `[]`, neither the deterministic renderer nor the amplifier consume it). That's the "schema seam for M12" — preserves forward-compat for the deferred network-mocking milestone without committing v1 to ship the capture.
- The reader should see one consistent scope statement, not a DoD line that promises a feature the milestone explicitly dropped.

After this sweep, every box in the v1 DoD is `[x]` with a `✅ vX.Y.Z` footprint. The doc and the shipped code agree.

### New

Nothing new — doc-only sweep.

### Changed

- `docs/07-build-plan.md` — all seven v1 DoD checkboxes are now `[x]` with the version each line shipped in. The "Record" bullet's captured-event list no longer includes `outgoing requests`, with a parenthetical noting M5's explicit scope cut and the preserved schema seam.

### Fixed

- DoD/scope drift on the "Record" bullet (described in Problem). The fix is the DoD-bullet edit above, not a code change.

Still-known issue, deliberately not fixed here (and now intentionally a separate PR after the major bump): `scripts/new-version.sh` uses `awk -v stub="$stub"` to inject the H2 stub, which fails on BSD awk because multi-line `-v` values aren't allowed. Worked around manually for the third consecutive PR. Worth fixing in its own post-v1.0.0 patch — either pipe the stub via stdin or require GNU awk.

### Files Changed

| File | Change |
|------|--------|
| `docs/07-build-plan.md` | Tick all v1 DoD checkboxes with their shipping versions; reconcile the "Record" bullet to match M5's actual scope (drop "outgoing requests" + add parenthetical noting M12 deferral). |
| `Versions/v0/v0.7/release-notes.md` | This file. |

### Verification

- Visual: every line in the v1 DoD section of `07-build-plan.md` starts with `- [x]` (no `- [ ]` left in that block).
- Cross-reference: each `✅ vX.Y.Z` footprint maps to either a release-notes entry, a milestone footer, or both.
- `awk '/^## M[456]/,/^---$/' docs/07-build-plan.md | grep -E "^- \[ \]|^  - \[ \]"` returns no rows — every M4/M5/M6 checkbox is `[x]`.

### What's next

**The major bump to `v1.0.0`.**

`v0.7.8` is the last patch of the pre-release line. The next version is `v1.0.0 — v1 Ship` (or similar — the title is the call) and is a minor-bump-style version (own folder under `Versions/v1/v1.0/release-notes.md`). The body is the **release announcement**: what `v1.0.0` is, what's in it, who it's for, and what's intentionally not in it. No new code lands in `v1.0.0` itself — the work is the writeup. After merge, the version line resets to `v1.0.x` for post-ship patches.

The BSD-awk bug in `scripts/new-version.sh` is the natural first patch after `v1.0.0` — every version has hit it, the workaround is manual, and the fix is small.

## v0.7.7 — README Quickstart (2026-05-14)

### Problem

The v1 Definition of Done has a `README.md` line:

> README.md has a quickstart that a new operator can follow end-to-end (install Chrome ext → record → audit → render a Playwright spec).

The pre-v0.7.7 `README.md` had a "Quickstart" section, but it was a **developer bootstrap** (`nvm use` → `make setup` → `make ci` → `make build`) — the right thing for someone *working on webspec*, the wrong thing for someone *using* it. There were no install steps for the Chrome extension, no record/audit walkthrough, no `record-to-spec` invocation, and no way to actually run a rendered spec. The Status section was also stale — it claimed M5 was the latest milestone and M6 was "next," but M6 has been done since v0.7.4 and the live-site render verification shipped in v0.7.6.

A secondary friction surfaced while drafting: running a rendered spec against an arbitrary path doesn't have a one-line invocation. `@playwright/test` is a dep of `packages/cli`, not the root, so `npx playwright test some-path.spec.ts` from the repo root doesn't resolve the binary. The natural command — `pnpm --filter @webspec/cli exec playwright test ...` — changes cwd to `packages/cli/` before exec, breaking any relative paths the operator passes. There needs to be a clean wrapper for step 6 or the quickstart trails off on its most important command.

### Solution

Rewrite the README around an **operator-facing six-step quickstart**, and add the missing Makefile target to make step 6 a one-liner.

**Six-step operator quickstart**, end-to-end:

1. **Build the toolkit.** `git clone` → `nvm use` → `pnpm install` → `pnpm -w build` (builds core + cli + extension).
2. **Install the Chrome extension.** `chrome://extensions/` → Developer mode → Load unpacked → `packages/chrome-extension/dist/`.
3. **Audit a page.** Two surfaces, identical findings: in-browser ("Audit this tab") or CLI (`node packages/cli/dist/index.js audit <url>`). Both use `wcag21aa + section508 + best-practice`.
4. **Record a workflow.** Click extension icon → Record → walk through flow (passwords masked automatically) → Stop → review → Download recording.json.
5. **Render a Playwright spec.** `node packages/cli/dist/index.js record-to-spec recording.json` (deterministic happy path) or `... --provider bedrock` (adds LLM-amplified negative scenarios as additional `test()` blocks).
6. **Run the spec.** `make run-spec SPEC=path/to/recording.spec.ts`.

Plus an aside on the realistic v1 integration pattern: drop the rendered `.spec.ts` into your own app's existing Playwright test suite — it only imports from `@playwright/test`, so it slots in without any webspec dependency.

**`make run-spec` target.** New Makefile target that wraps the cwd-sensitive `pnpm --filter @webspec/cli exec playwright test` invocation. Accepts `SPEC=<path>`, resolves it to an absolute path before handing to Playwright, and points Playwright at a shared `playwright.config.ts` so it can find the spec regardless of where it lives. First-time setup (`pnpm --filter @webspec/cli exec playwright install chromium`) is documented in the README and the target's header comment.

**Shared Playwright config.** New `tests/fixtures/recordings/playwright.config.ts`: 7-line `defineConfig` (`testDir: '.'`, `testMatch: '**/*.spec.ts'`, headless, line reporter). Lives alongside the three reference recordings from v0.7.6 so they (and any other recording rendered to a path on disk) can be run through `make run-spec` with no per-spec config setup.

**Status section refresh.** Updated to read "M5 and M6 both shipped" with pointers to v0.6.0 (Chrome ext flagship) and v0.7.6 (render-to-spec live verification). v1 ships once the remaining DoD boxes are ticked.

**Build-plan box.** `README.md has a quickstart …` is now `[x]` in `docs/07-build-plan.md`'s v1 DoD checklist, with `✅ v0.7.7.`

### New

- `tests/fixtures/recordings/playwright.config.ts` — shared Playwright config the `make run-spec` target points at. Lets operators run any rendered spec by file path without authoring a config first.
- `Makefile`: new `run-spec` target. `make run-spec SPEC=…` resolves the path, points Playwright at the shared config, and runs the spec via the cli package's installed `@playwright/test`. Documented in `make help` and in the README's step 6.

### Changed

- `README.md` — full rewrite of the user-facing surface:
  - **Status** updated to reflect M5 + M6 both shipped (with version pointers).
  - **Quickstart** replaced with a six-step operator walkthrough (build → install ext → audit → record → render → run), with copy-pasteable commands.
  - **Develop** section (renamed from the old "Quickstart") preserves the `nvm use` / `make setup` / `make ci` bootstrap for contributors.
  - **Repo layout** updated to include `tests/fixtures/` and the new "stacked release notes per minor" wording (the per-patch folder convention died in v0.7.5).
- `docs/07-build-plan.md` — `README.md has a quickstart …` box in the v1 DoD checklist is now ticked with `✅ v0.7.7`.

### Fixed

Nothing fixed in the shipped code path. Still-known issue (carried from v0.7.6, not fixed here): `scripts/new-version.sh` fails on BSD awk when injecting the H2 stub. Worked around manually again for this PR. Should be fixed in its own version — switch from `awk -v stub="$stub"` to piping the stub via stdin, or require GNU awk.

### Files Changed

| File | Change |
|------|--------|
| `README.md` | Rewrite. New operator-facing 6-step quickstart; refreshed Status; renamed contributor section to Develop. |
| `Makefile` | New `run-spec` target wrapping the cwd-sensitive Playwright invocation. Added to `.PHONY`. |
| `tests/fixtures/recordings/playwright.config.ts` | New shared config for `make run-spec`. |
| `docs/07-build-plan.md` | Tick the `README.md has a quickstart …` box in v1 DoD. |
| `Versions/v0/v0.7/release-notes.md` | This file. |

### Verification

End-to-end of the documented six-step path, on this machine:

- Steps 1–2: confirmed previously (extension already installed locally; `pnpm -w build` ran during v0.7.6).
- Step 3: `node packages/cli/dist/index.js audit https://example.com` returns the expected `landmark-one-main` + `region` findings.
- Step 4: the three reference recordings under `tests/fixtures/recordings/three-sites/` are the artifacts captured during v0.7.6.
- Step 5: `node packages/cli/dist/index.js record-to-spec tests/fixtures/recordings/three-sites/example.recording.json --out tests/fixtures/recordings/three-sites/.tmp/example.spec.ts` writes a clean 3-line spec.
- Step 6: `make run-spec SPEC=tests/fixtures/recordings/three-sites/.tmp/example.spec.ts` → `1 passed (2.3s)` against the live `example.com`.

### What's next

One DoD line remains before `v1.0.0`:

- **Tick the remaining v1 DoD boxes** in `docs/07-build-plan.md`. Most are factually true at this point (Chrome ext installs + runs ✓, two modes ✓, render-to-spec with positive + negative scenarios ✓, thin CLI ✓, Bedrock-via-AWS-credentials ✓, verified on three deployed sites ✓ for both audit-parity and render-to-spec, all M4–M6 milestones ✓). The next version is a doc-only sweep that goes through the checklist, ticks each box with the version it shipped in, and prepares the final v0.x patch before the major bump.

Then the **major bump to v1.0.0**.

## v0.7.6 — Three Site Render Verification (2026-05-14)

### Problem

M6's implementation work shipped across v0.7.0–v0.7.4 (deterministic renderer, amplified IR, LLM amplifier, integration test, amplification-pass golden), but the **v1 Definition of Done** still had two unclosed lines tied to M6:

1. **"Verified on three deployed sites — … recordings render to passing Playwright specs against each site's golden-path flow."** v0.6.0 closed the *audit-parity* half of this line; the *render-to-spec* half had no evidence. The integration test in v0.7.3 ran against a hermetic `file://` fixture, which proves the pipeline works in isolation but not that captures from the Chrome extension survive the full ext → render → run-against-live-site loop.
2. **M6 milestone checkboxes were still `[ ]`.** Code existed; boxes hadn't been ticked.

Without the live-site render evidence, we can't honestly call M6 done or move toward `v1.0.0`.

### Solution

Captured one recording per v0.6.0 site via the unpacked Chrome extension, rendered each through `webspec record-to-spec`, and ran the resulting `.spec.ts` with Playwright against the live URL. All three passed cleanly on the first try.

| Site | Events | Render result | Playwright run |
|------|--------|---------------|----------------|
| `https://example.com/` | 2 (`click` + `navigate`) | 3-line spec: `goto` + `getByRole(link).click()` + `waitForURL` | ✅ passed (2.6s) |
| `https://react.dev/` | 2 (`click` + `navigate` w/ `reason: "history"`) | 3-line spec: `goto` + `getByRole(link).nth(0).click()` + `expect(page).toHaveURL(...)` | ✅ passed (1.5s) |
| `https://demo.playwright.dev/todomvc/` | 5 (`input` × 2, `keydown` × 2, `change`) | 6-line spec: `fill`/`press('Enter')` × 2, `getByRole(checkbox).nth(0).check()` | ✅ passed (1.2s) |

Three behaviors specifically verified by this matrix that the synthetic v0.7.3 fixture did not cover:

- **`navigate.reason` divergence renders correctly against real navigation models.** example.com's real page load produced `reason: "navigate"` → `waitForURL` action; react.dev's client-side route push produced `reason: "history"` → `expect(page).toHaveURL` assertion. Both behaviors are specified in `docs/06-renderer.md` and now have live-site evidence.
- **`role=…[name=…] >> nth=N` selectors round-trip.** The recorder emits the `>> nth=N` suffix to disambiguate (react.dev had multiple "Learn React" links; TodoMVC had multiple toggle checkboxes once the second todo landed). The renderer correctly translates this to `getByRole(...).nth(N)`.
- **`change` events on checkboxes with `value: "true"` render to `.check()`** (and would render to `.uncheck()` for `"false"`). TodoMVC was the only fixture that exercised this branch in production.

The recordings are committed under `tests/fixtures/recordings/three-sites/` so the verification is reproducible. A future regression check can re-run the render pipeline against these JSONs without re-capturing — with the caveat that real sites drift, so eventual breakage may reflect site changes, not a webspec bug.

This also closes M6 in `docs/07-build-plan.md`: every box in the milestone is ticked, with the version each task shipped in. M6 is done at v0.7.4 in code; v0.7.6 is the verification that lets us say so on the build plan.

### New

- `tests/fixtures/recordings/three-sites/example.recording.json` — captured workflow on `example.com` (click "Learn more" link → cross-origin navigation to iana.org).
- `tests/fixtures/recordings/three-sites/react-dev.recording.json` — captured workflow on `react.dev` (click "Learn React" CTA → SPA route change to `/learn`).
- `tests/fixtures/recordings/three-sites/todomvc.recording.json` — captured workflow on `demo.playwright.dev/todomvc/` (add two todos, mark one complete).

### Changed

- `docs/07-build-plan.md` — every M6 checkbox now `[x]` with the version it shipped in (v0.7.0 deterministic pass + CLI, v0.7.0 deterministic golden, v0.7.1 IR, v0.7.2 amplification pass, v0.7.3 integration test, v0.7.4 amplification golden). Milestone footer reads "✅ M6 done at v0.7.4."
- `.gitignore` — added `tests/fixtures/recordings/**/.tmp/` so the rendered specs + Playwright config under each recording's `.tmp/` directory stay out of git (mirrors the existing `**/tests/integration/.tmp/` rule).

### Fixed

- Nothing in the shipped code path. One bug noted but **not** fixed in this PR: `scripts/new-version.sh` uses `awk -v stub="$stub"` to inject the new H2 heading, which fails on BSD awk (macOS) with `awk: newline in string ...` because BSD awk doesn't accept newlines in `-v` values. The branch creation still succeeds; only the stub-prepend fails. Worked around manually here. Worth fixing separately by switching to GNU awk or by piping the stub through stdin.

### Files Changed

| File | Change |
|------|--------|
| `tests/fixtures/recordings/three-sites/example.recording.json` | New — captured workflow on example.com (2 events). |
| `tests/fixtures/recordings/three-sites/react-dev.recording.json` | New — captured workflow on react.dev (2 events, client-side routing). |
| `tests/fixtures/recordings/three-sites/todomvc.recording.json` | New — captured workflow on TodoMVC (5 events: form + checkbox). |
| `docs/07-build-plan.md` | Tick all M6 checkboxes with the version each shipped in; add "✅ M6 done at v0.7.4" to the milestone footer. |
| `.gitignore` | Add `tests/fixtures/recordings/**/.tmp/` so rendered specs aren't committed. |
| `Versions/v0/v0.7/release-notes.md` | This file. |

### Verification

For each site: render with `node packages/cli/dist/index.js record-to-spec <recording.json> --out <.tmp>/<site>.spec.ts`, then `npx playwright test --config <.tmp>/playwright.config.ts <.tmp>/<site>.spec.ts`. The Playwright config under each `.tmp/` is a 6-line `defineConfig` (testDir: '.', headless, line reporter). All three specs pass against the live URLs as of 2026-05-14.

### What's next

Two items remain before `v1.0.0`:

1. **README quickstart** — end-to-end walkthrough a new operator can follow (install Chrome ext → record → audit → render a Playwright spec). The `README.md` line in the v1 DoD.
2. **Tick the remaining v1 DoD boxes** in `docs/07-build-plan.md` (Chrome ext install + run, recording → Playwright with positive + negative scenarios, thin CLI for CI integration, LLM access via Bedrock, "verified on three deployed sites" — most of these are already true, just unchecked).

After those, it's a minor → minor → **major bump to v1.0.0**.

## v0.7.5 — Version Folder Consolidation (2026-05-13)

### Problem

Through v0.7.4 the versioning convention created one folder per patch under `Versions/v{major}/v{major}.{minor}.{patch}/`. After 31 patches across v0.0 through v0.7, the `Versions/v0/` tree had 31 sibling folders — each holding a single `release-notes.md`. Navigating release history meant opening 31 separate files, and the per-patch folder was empty ceremony: nothing else ever lived inside it. Rob flagged "we just create a lot of folders" — the structure had more friction than signal.

A common changelog convention (Keep-a-Changelog, most OSS projects) is one file containing all versions, newest-at-top. The full-history-in-one-file shape is too coarse for a project still actively building — v0 alone would be 1500+ lines. The natural middle ground is one stacked file per **minor**: collocates related patches (e.g. all of M6's v0.7.x work in one place), keeps each file scannable, and reduces folder count by 4x.

### Solution

**Folder shape.** `Versions/v{major}/v{major}.{minor}/release-notes.md`. Each minor's file is a stacked changelog with newest patch at the top:

```
# v0.7

## v0.7.5 — Version Folder Consolidation (2026-05-13)
### Problem / ### Solution / …

## v0.7.4 — M6 Amplification Pass Golden (2026-05-13)
### Problem / ### Solution / …

## v0.7.3 — M6 Integration Test (2026-05-12)
…
```

H1 is the minor version. Each patch is an H2 with version + title + date in parens, mirroring the H1 the old convention used. Section headers (Problem / Solution / etc.) demote one level to H3.

**Backfill.** All 31 existing per-patch folders consolidated into 8 minor files (v0.0 through v0.7). A one-off awk-based consolidator handled the heading demotion in a single pass (deepest first to avoid cascading) and respected fenced code blocks (e.g. `# A11y Report` lines inside example output in v0.3.5 stayed as H1 inside the fence, not demoted to H2). Newest-at-top ordering verified across all 8 files. The 31 old folders were `rm -rf`'d.

**Script rewrite.** `scripts/new-version.sh` now:
1. Detects the latest version by scanning H2 headings (`## v{maj}.{min}.{pat} …`) across `Versions/v*/v*/release-notes.md` rather than reading folder names. The scan is fence-aware — `## v…` lines inside ` ``` ` code blocks (e.g. example markdown documenting the convention itself, like this PR's release notes) are skipped so they can't be mistaken for shipped versions.
2. **Patch bump** → prepends a new H2 stub at the top of the existing minor's file (just under the H1) via an awk insertion at the first H2 marker.
3. **Minor or major bump** → creates a new `Versions/v{major}/v{major}.{minor}/` folder with a fresh `release-notes.md` containing the H1 + first H2 stub.

Dirty-tree guard, branch creation (`V{maj}dot{min}dot{pat}/{Description}`), and `--dry-run` mode are unchanged. All three dry-run modes verified — patch correctly prepends, minor correctly creates v0.8, major correctly creates v1/v1.0.

**Docs.** `CLAUDE.md`'s versioning section rewritten to describe the new shape: example tree, file structure, what the script does on each bump, and the PR-title rule updated from "H1 in release-notes.md" to "H2 heading in the minor's release-notes.md."

**Follow-up.** The `bellese-version-pr` skill in the `bellese-claude-toolkit` plugin repo still documents the old per-patch shape. Deferred to a follow-up PR in that repo (tracked outside this commit).

### New

- 8 consolidated `Versions/v0/v0.{0..7}/release-notes.md` files. 31 patches' history preserved verbatim under stacked H2 entries.

### Changed

- `scripts/new-version.sh` — rewritten for per-minor folder shape: scans H2s to find latest version; prepends on patch, creates on minor/major.
- `CLAUDE.md` — versioning section updated (tree, stacked-file structure, script behavior, PR-title rule).

### Fixed

_None — convention refactor + script rewrite._

### Files Changed

| File | Change |
|------|--------|
| `Versions/v0/v0.0/release-notes.md` through `v0.7/release-notes.md` | New — 8 stacked changelogs (newest patch at top). |
| `Versions/v0/v0.0.0/release-notes.md` through `v0.7.4/release-notes.md` | Deleted — 31 per-patch folders retired. Content preserved verbatim in the consolidated files. |
| `scripts/new-version.sh` | Rewritten — append-vs-create logic; H2-scan for latest version. |
| `CLAUDE.md` | Versioning section rewritten; PR-title rule updated. |

## v0.7.4 — M6 Amplification Pass Golden (2026-05-13)

### Problem

The M6 build-plan box at `docs/07-build-plan.md:144` asked for a golden test of "the amplification pass against a recorded-LLM-response fixture (deterministic test of 'given this recording + this LLM response, render this spec')." Reading that as written, it describes a single end-to-end golden: `WorkflowRecording` in → fake LLM stand-in returns a canned `AmplifiedRecording` → `renderAmplifiedPlaywrightSpec` → snapshot the `.spec.ts`.

What we actually had through v0.7.3 was two half-goldens — `tests/analyze/amplify/analyzer.test.ts` pinned the analyzer with a fake provider, `tests/render/e2e/amplified.test.ts` pinned the IR-to-source renderer with hand-written fixtures — but nothing wired them together. That coverage is logically sufficient (each half is pinned, so the composition is determined), but it's not what the box says, and a regression in how the analyzer's output shape meets the renderer's input expectations could slip past both half-goldens.

The same audit surfaced two stale checkboxes in the build plan that no longer reflected reality:

- M4's `A11yAnalyzer` (browser mode) box was unticked but had a note saying it had been folded into M5. The work actually shipped in v0.3.8 as part of content-script axe injection.
- M5's `webRequest` outgoing-request capture box was deferred to "M6-enables" — the decision was "let the renderer decide whether it needs network metadata before we pay for capture." M6 is now far enough along to answer: the deterministic renderer and the amplifier both ignore `WorkflowRecording.network`, and `docs/06-renderer.md:150` explicitly puts recorded-network mocking out of v1. The schema field stays as a forward-compat seam.

### Solution

**End-to-end golden.** `packages/core/tests/render/e2e/amplification-pass.test.ts` composes both halves:

1. A small hand-written `WorkflowRecording` — login flow with email input, password input, sign-in click.
2. A canned `AmplifiedRecording` standing in for the LLM's response — the recorded happy scenario plus one negative variant (empty password).
3. `AmplifyAnalyzer` instantiated with a fake `LLMProvider` (same `vi.fn` pattern as the existing analyzer tests) that returns the canned response.
4. The analyzer's output flows into `renderAmplifiedPlaywrightSpec`, and the result is pinned with `toMatchInlineSnapshot` — same style as the existing renderer goldens.

The snapshot captures two `test()` blocks with role-based locators, description comments, the visibility assertion on the happy path, and the `toContainText` assertion on the negative — exactly the shape a v1 Playwright spec should have. A regression in either the analyzer's plumbing or the renderer's source emission, or in how their boundary types line up, breaks this snapshot.

A second assertion verifies that the recording flows through to the LLM call without mutation (the user message contains `user@example.com`, `Sign in`, and the start URL verbatim).

**Build-plan housekeeping.** Two stale checkboxes resolved against current reality:

- M4 browser-mode `A11yAnalyzer` ticked with a v0.3.8 annotation.
- M5 `webRequest` capture struck through with an out-of-v1 note explaining the M6 audit that retired it.

### New

- `packages/core/tests/render/e2e/amplification-pass.test.ts` — end-to-end golden for the M6 amplification pass. Two tests (snapshot of the rendered spec; provider-input verification), 186 → 188 total tests passing.

### Changed

- `docs/07-build-plan.md` — three closures: M4 browser-mode box ticked with v0.3.8 annotation; M5 webRequest box struck through with out-of-v1 note; M6 amplification-pass-golden box ticked with this PR's annotation.

### Fixed

_None — pure addition + doc housekeeping._

### Files Changed

| File | Change |
|------|--------|
| `packages/core/tests/render/e2e/amplification-pass.test.ts` | New — end-to-end golden composing analyzer + renderer. |
| `docs/07-build-plan.md` | M4 browser-mode box ticked, M5 webRequest box struck through, M6 amplification-pass-golden box ticked. |
| `Versions/v0/v0.7.4/release-notes.md` | This file. |

### What's next

M6's checkbox state after this PR: six of seven sub-bullets ticked. The remaining ones at the v1 DoD level (live Bedrock amplifier run; recorder→render parity on three deployed sites; README quickstart pass) aren't M6 sub-bullets — they're the v1 DoD items that gate `v1.0.0`. A future minor bump declares M6 itself done; the patch sequence likely closes the three DoD items first.

## v0.7.3 — M6 Integration Test (2026-05-12)

### Problem

By v0.7.2 the pipeline was code-complete on paper: a captured `WorkflowRecording` flows through the deterministic renderer (v0.7.0) or the LLM amplifier (v0.7.2) into a Playwright `.spec.ts`. The 232 unit and golden tests covered every action, every selector strategy, every navigate reason, every schema constraint. But nothing in the test suite actually *ran* a rendered spec through Playwright's runner against a real browser. The full loop — recording → render → run → pass — had never been closed end-to-end.

`docs/06-renderer.md` named the missing piece: a hermetic local fixture under `tests/fixtures/playwright-target/`, a recording of a user flow on it, and an integration test that renders the recording and watches the rendered spec execute. That's v0.7.3.

### Solution

Three pieces:

**Fixture.** `tests/fixtures/playwright-target/form.html` — a single signup-style HTML page with an email input, a country dropdown, a subscribe checkbox, a submit button, and a hidden success message that appears after `submit`. ~30 lines. Self-contained: no build, no server, no network. Loaded by the rendered spec via `file://`. Covers `input` (fill), `change` on `<select>` (selectOption), `change` on checkbox (check), `click`, and post-action visibility — five of the deterministic mapping rows in one fixture.

**Recording.** Hand-built in TypeScript inside the integration test itself. The fixture lives at an absolute path on disk; the recording's `startUrl` is `file://${absolutePath}` resolved at test time. Selector hardening produces `role=textbox[name="Email"]`, `role=combobox[name="Country"]`, etc. — same shape the real recorder would emit on this HTML.

**Integration test.** `packages/cli/tests/integration/render-and-run.integration.test.ts`:

1. Builds the `WorkflowRecording` in memory.
2. Calls `renderPlaywrightSpec(recording)` — exercises the v0.7.0 deterministic path.
3. Writes the rendered spec to a gitignored `.tmp/` directory under the integration-test folder (so `@playwright/test` resolves from `packages/cli/node_modules`).
4. Spawns `npx playwright test --config <inline-config> <rendered-spec>` — the actual Playwright test runner, headless Chromium, real browser.
5. Asserts exit code 0. On failure, surfaces the runner's stdout/stderr so the cause is debuggable rather than just an exit-code mismatch.

Runs in ~1.7s on the warm path (after Chromium's been downloaded). The cold path requires a one-time `npx playwright install chromium` (~90 MB). No mocking — the rendered spec is the actual artifact the CLI would emit; Playwright is the actual runner the user would use.

### New

- `tests/fixtures/playwright-target/form.html` — minimal signup form fixture. Email input + country select + subscribe checkbox + submit button + success message.
- `packages/cli/tests/integration/render-and-run.integration.test.ts` — vitest integration test that drives the full pipeline and shells out to Playwright.

### Changed

- `packages/cli/package.json` — add `@playwright/test` (^1.60.0) as a devDependency.
- `pnpm-lock.yaml` — locked Playwright + its dependency closure.
- `.gitignore` — ignore Playwright's `test-results/`, `playwright-report/`, and the integration test's per-run `.tmp/` directory.

### Files Changed

| File | Change |
|------|--------|
| `tests/fixtures/playwright-target/form.html` | New — hermetic HTML fixture covering input / select / checkbox / submit. |
| `packages/cli/tests/integration/render-and-run.integration.test.ts` | New — full-loop integration test (render → spawn Playwright → assert exit 0). |
| `packages/cli/package.json` | Add `@playwright/test` devDependency. |
| `pnpm-lock.yaml` | Lock the Playwright dependency closure. |
| `.gitignore` | Ignore Playwright runner artifacts and the per-run integration `.tmp/`. |
| `Versions/v0/v0.7.3/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **233/233** tests pass (232 prior + 1 new integration test). The integration test runs by default — no opt-in flag — and takes ~1.7s on a warm Chromium install. Type-check clean. Vite bundle clean.

#### What this proves

Before v0.7.3, the pipeline's correctness relied on three independent sources of evidence:

1. Schema validation tests for every IR shape.
2. Golden tests for the deterministic renderer (24) + amplified renderer (10).
3. Manual three-site smoke at v0.6.0 (recorder + audit).

Each of those left the same gap: do the strings we emit actually compile, launch a browser, navigate to the recorded URL, perform the recorded actions, and exit cleanly? v0.7.3 answers yes, with a real Chromium process, real `await page.fill()` calls, and a real form submit.

#### First-time setup

If `npx playwright install chromium` hasn't been run on a machine, the integration test fails with Playwright's own clear message ("Please install browsers..."). One-line fix. No code change. CI integration is deferred — the test runs locally as part of the regular suite.

### What's next

M6 is **functionally complete**. v1 DoD outstanding items:

- **Live amplifier verification on AWS Bedrock.** The amplifier code path is goldenable but hasn't fired against a real model yet. Lands the day AWS credentials are wired.
- **Recorder → render parity on three real deployed sites.** v0.6.0 verified audit parity on three sites; the renderer half of that verification (record on each, render, run) wasn't done because the renderer didn't exist yet. Now it does.
- **README quickstart** that walks an unfamiliar reader from "clone the repo" to "first rendered spec." Drafted but stale — needs an update against the current CLI surface.

When those are checked, the next bump is `v1.0.0` — the v1 Definition of Done at the top of `docs/07-build-plan.md`.

## v0.7.2 — LLM Amplifier (2026-05-12)

### Problem

v0.7.0 closed the deterministic loop (recording → Playwright spec) and v0.7.1 landed the `AmplifiedRecording` IR. What was still missing: the LLM that *produces* the amplified IR from a captured `WorkflowRecording`. Without it, the IR has no producer and the v1 differentiator (negative scenarios alongside the recorded happy path) doesn't exist.

The four planning decisions from the walk-through:

1. **Input**: the LLM sees the full `WorkflowRecording` JSON (events + selectors + navigation + start URL). Not just the events array; not DOM snapshots.
2. **Constraint**: a fixed list of plausible negative archetypes in the system prompt, with explicit instructions to pick only the 2–4 most applicable.
3. **Volume**: 1 happy + 2–4 negatives = ~3–5 scenarios per recording. No hard ceiling enforced in code.
4. **Caching**: standard M1 pattern — system prompt cached via the adapter, user prompt (recording JSON) varies per call. Structured output via `tools` + `tool_choice` over `AmplifiedRecordingSchema`.

### Solution

Three pieces in `@webspec/core`, plus a `--provider` flag on the CLI:

**`SYSTEM_PROMPT` and `formatUserPrompt`** in `packages/core/src/analyze/amplify/prompt.ts`. The system prompt frames the model as a Playwright test author, enumerates the action/assertion sets the IR allows, maps each `RecordedEvent` kind (and each `navigate.reason`) to a target action, lists the five negative archetypes with explicit "pick 2–4 most plausible — skip ones that don't apply," and explicitly forbids fabricated selectors and happy-scenario drift. The user prompt is the `WorkflowRecording` stringified inside a fenced JSON block.

**`AmplifyAnalyzer`** in `packages/core/src/analyze/amplify/analyzer.ts`. Constructor takes an `LLMProvider`. The single `amplify(recording)` method calls `llm.complete({ system, messages, schema: AmplifiedRecordingSchema, schemaName: 'AmplifiedRecording' })` and returns the validated result. Zod validation lives in the adapter (same gate the M2 TestPlan analyzer uses); a drift between the LLM's output and the schema bubbles as `LLMValidationError` rather than emitting a broken spec.

**CLI integration.** `webspec record-to-spec` gains a `--provider <name>` flag. Valid values for v1: `bedrock`. When set, the deterministic pass is replaced — the CLI constructs a `BedrockAdapter`, calls `AmplifyAnalyzer.amplify`, and renders the result with `renderAmplifiedPlaywrightSpec` (the v0.7.1 renderer that emits one `test()` block per scenario). Without `--provider`, behavior is unchanged from v0.7.0 — same deterministic happy-path spec.

**Tests use a fake `LLMProvider`** (vitest mock) so the suite runs with zero AWS dependency. Live Bedrock verification is gated on AWS credentials being set up and lives outside this suite; the day those land, the amplifier works end-to-end without further code changes.

### New

- `packages/core/src/analyze/amplify/prompt.ts` — `SYSTEM_PROMPT` (cacheable) + `formatUserPrompt(recording)`.
- `packages/core/src/analyze/amplify/analyzer.ts` — `AmplifyAnalyzer` class.
- `packages/core/tests/analyze/amplify/prompt.test.ts` — 7 tests asserting load-bearing instructions are present (frames the model, lists archetypes, enumerates action/assertion kinds, forbids drift, maps every `navigate.reason`, embeds recording JSON in the user prompt).
- `packages/core/tests/analyze/amplify/analyzer.test.ts` — 4 tests covering the analyzer with a fake provider (returns validated response, passes recording through, requests `AmplifiedRecordingSchema` validation, propagates provider errors).
- `--provider <name>` flag on `webspec record-to-spec`. 3 new arg-parser tests (accepts `bedrock`, rejects unknown value, rejects missing value).

### Changed

- `packages/core/src/index.ts` — export `AmplifyAnalyzer` plus the prompt builders (renamed to `AMPLIFY_SYSTEM_PROMPT` / `formatAmplifyUserPrompt` to avoid colliding with the M2 TestPlan prompt symbols).
- `packages/cli/src/args.ts` — extend `RecordToSpecCommand` with optional `provider: 'bedrock'`. `parseRecordToSpec` validates `--provider` against a small allowlist; updates the help text to mention amplified mode.
- `packages/cli/src/commands/record-to-spec.ts` — when `cmd.provider` is set, construct the matching `LLMProvider`, run the analyzer, render with `renderAmplifiedPlaywrightSpec`. Otherwise the v0.7.0 deterministic path. `RecordToSpecResult` gains `scenarioCount` and `amplified` flag.
- `packages/cli/src/index.ts` — stderr log now mentions `(amplified, N scenarios)` when amplified.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/analyze/amplify/prompt.ts` | New — system + user prompt for the amplifier. |
| `packages/core/src/analyze/amplify/analyzer.ts` | New — `AmplifyAnalyzer` wrapping `LLMProvider.complete` with the `AmplifiedRecordingSchema` validation seam. |
| `packages/core/tests/analyze/amplify/prompt.test.ts` | New — 7 prompt-shape tests. |
| `packages/core/tests/analyze/amplify/analyzer.test.ts` | New — 4 analyzer tests with a fake `LLMProvider`. |
| `packages/core/src/index.ts` | Export `AmplifyAnalyzer` + renamed prompt helpers. |
| `packages/cli/src/args.ts` | Add `--provider` flag and `LLMProviderId` type. Update help text. |
| `packages/cli/src/commands/record-to-spec.ts` | Branch on `cmd.provider`: amplified path via `AmplifyAnalyzer` + `renderAmplifiedPlaywrightSpec`; deterministic path unchanged. |
| `packages/cli/src/index.ts` | Stderr log mentions amplified + scenario count. |
| `packages/cli/tests/args.test.ts` | 3 new `--provider` parsing tests. |
| `Versions/v0/v0.7.2/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **232/232** tests pass (218 prior + 14 new — 11 amplifier + 3 arg-parser). Type-check clean across `core` and `cli`. CLI build clean.

#### Deterministic-path smoke (unchanged)

```sh
$ node packages/cli/dist/index.js record-to-spec /tmp/select-recording.json --out /tmp/smoke.spec.ts
webspec record-to-spec: rendered 3 events → /tmp/smoke.spec.ts
```

Output identical to v0.7.0. No regression.

#### Amplified-path smoke (deferred — needs AWS creds)

```sh
$ node packages/cli/dist/index.js record-to-spec recording.json --provider bedrock
webspec record-to-spec: rendered N events (amplified, M scenarios) → recording.spec.ts
```

The amplified path's unit-test coverage (analyzer with fake provider) is complete; live verification is gated on AWS access. The day those credentials land, this command runs end-to-end without further code changes.

### What's next

- **v0.7.3** — Integration test against a local fixture. Hand-written HTML under `tests/fixtures/playwright-target/`, a hand-written `WorkflowRecording` JSON of the user flow on it, render via `webspec record-to-spec`, run the emitted spec through `@playwright/test`, assert it passes. Closes the "spec compiles and actually executes" gap.
- **v1.0.0** — M6 done = v1 done. The remaining v1 DoD items get checked off (README quickstart, recorder-render parity verified on the three-site smoke).

## v0.7.1 — Amplified Recording IR (2026-05-12)

### Problem

v0.7.0 closed the M5→M6 loop for the deterministic case — capture a `WorkflowRecording`, render a single `test()` block, done. The amplification path (v1's differentiator: negative scenarios generated by the LLM) needs a typed intermediate between the LLM call and the renderer. `docs/06-renderer.md` sketched `AmplifiedRecording` but didn't land the zod schema, the inferred TypeScript types, or a renderer that can consume it. Without those, v0.7.2's LLM call has nothing to validate its output against and nowhere to send it.

### Solution

Three pieces, no LLM in the loop yet:

**Schema.** `AmplifiedRecording`, `AmplifiedScenario`, `AmplifiedAction`, `AmplifiedAssertion` land as zod schemas in `packages/core/src/types/analysis.ts`, alongside `WorkflowRecording`. Not a fourth `Analysis` variant — it's the intermediate the amplifier produces and the renderer consumes; user-facing artifacts stay `WorkflowRecording` (capture) and the rendered `.spec.ts` (output).

Action set matches the deterministic mapping locked in `06-renderer.md`: nine kinds covering the six base Playwright actions (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`) plus three derived-from-`change` primitives (`selectOption`, `check`, `uncheck`). Assertion set has seven kinds (`visible`, `hidden`, `text` with `equals`/`contains` mode, `url`, `count`, `value`, `checked`). Each `AmplifiedScenario` is `kind: 'happy' | 'negative'` with a required `name`, optional `description`, plus `actions[]` and `assertions[]`. The arrays are intentionally separate: actions run first, then assertions. Mid-flow assertions aren't expressible in v1; most negative scenarios fit "do actions, assert end state" cleanly and adding a unified `steps[]` array is a future schema bump if a real case forces it.

**Renderer.** `renderAmplifiedPlaywrightSpec(amplified)` joins `renderPlaywrightSpec` in `packages/core/src/render/e2e/renderer.ts`. Emits one Playwright `test()` block per scenario; optional `description` rides above the test as a single-line `//` comment (multi-line descriptions get newline-preserved comments). Shares the `locator()` and `quote()` helpers with the v0.7.0 deterministic renderer — no duplication of selector translation or string-quoting logic. Action and assertion rendering each get their own dispatch function (`renderAction`, `renderAssertion`) with TypeScript exhaustiveness checks on the discriminated unions.

**Tests.** 29 schema-validation tests (every action kind, every assertion kind, scenario constraints, top-level recording constraints, negative cases like empty names / unknown kinds / negative counts / non-integer counts) plus 10 renderer golden tests (scaffold, every action, every assertion, a happy+negative pair fixture that asserts test-block ordering and non-interleaving).

### New

- `AmplifiedActionSchema`, `AmplifiedAssertionSchema`, `AmplifiedScenarioSchema`, `AmplifiedRecordingSchema` in `packages/core/src/types/analysis.ts`; matching inferred TypeScript types (`AmplifiedAction`, `AmplifiedAssertion`, `AmplifiedScenario`, `AmplifiedRecording`).
- `renderAmplifiedPlaywrightSpec(amplified)` in `packages/core/src/render/e2e/renderer.ts` plus internal `renderAction` / `renderAssertion` helpers.
- `packages/core/tests/types/amplified-recording.test.ts` — 29 schema-validation tests across four describe blocks (action, assertion, scenario, top-level recording).
- `packages/core/tests/render/e2e/amplified.test.ts` — 10 renderer golden tests across four describe blocks (scaffold + actions + assertions + happy/negative pair).

### Changed

- `packages/core/src/index.ts` — export `renderAmplifiedPlaywrightSpec`. (The new types are already re-exported via `export * from './types/analysis.js'`.)
- `packages/core/src/browser.ts` — same export, for the Chrome bundle.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add `AmplifiedRecording` + nested action/assertion/scenario schemas and inferred types. |
| `packages/core/src/render/e2e/renderer.ts` | Add `renderAmplifiedPlaywrightSpec` + `renderAction` / `renderAssertion` dispatchers; share locator + quote helpers with the v0.7.0 deterministic renderer. |
| `packages/core/src/index.ts` | Export the new renderer. |
| `packages/core/src/browser.ts` | Export the new renderer in the browser bundle. |
| `packages/core/tests/types/amplified-recording.test.ts` | New — 29 zod-validation tests for the IR. |
| `packages/core/tests/render/e2e/amplified.test.ts` | New — 10 renderer golden tests with happy/negative pair fixture. |
| `Versions/v0/v0.7.1/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **218/218** tests pass (179 prior + 39 new). Type-check clean (`tsc -b` across `core`).

### What's next

- **v0.7.2** — Wire the LLM amplifier. New analyzer in `packages/core/src/analyze/amplify/` that takes a `WorkflowRecording` plus an `LLMProvider`, prompts for negative scenarios, validates the response against `AmplifiedRecordingSchema`, returns the typed result. CLI: `webspec record-to-spec --provider X` switches to the amplified path. Skipped when no provider is configured — deterministic spec emits alone.
- **v0.7.3** — Integration test against `tests/fixtures/playwright-target/`. Spec compiles and the happy-path test passes via the Playwright runner.
- **v1.0.0** — M6 done = v1 done.

## v0.7.0 — M6 Deterministic Renderer (2026-05-12)

### Problem

M5 closed with a recorder that produces typed `WorkflowRecording` JSON files — hardened selectors, dedup, navigation events, session persistence, all in. But the recordings were dead-ends. There was no way to turn a `recording.json` into a runnable test. M6 exists to close that loop: capture a workflow once, render a Playwright spec from it.

The design doc (`docs/06-renderer.md`, v0.6.2) settled the contract: deterministic pass first, LLM amplification later (v0.7.2), structured `AmplifiedRecording` IR in between. v0.7.0 ships the first piece — the deterministic pass — so the loop closes end-to-end even when no LLM is configured.

### Solution

Three pieces, all in this version:

**`renderPlaywrightSpec(recording, opts?)`** — a pure `WorkflowRecording → string` function in `packages/core/src/render/e2e/renderer.ts`. Browser-safe (string ops only; no Node deps). Mapping is exactly what `06-renderer.md` locked:

| Recorder event | Playwright |
|---|---|
| start (every recording) | `page.goto(startUrl)` |
| `click` | `locator.click()` |
| `input` | `locator.fill(value)` |
| `keydown` (with selector) | `locator.press(key)` |
| `keydown` (without selector) | `page.keyboard.press(key)` |
| `change` on checkbox/radio (`value: 'true'`) | `locator.check()` |
| `change` on checkbox/radio (`value: 'false'`) | `locator.uncheck()` |
| `change` on `<select>` (carries `options`) | `locator.selectOption(value)` |
| `submit` | `// form submit observed on <selector>` (Playwright has no submit primitive; the preceding click/keydown already triggered it) |
| `navigate` reason `reload` | `page.reload()` |
| `navigate` reason `navigate` | `page.waitForURL(url)` |
| `navigate` reason `history` / `hash` | `await expect(page).toHaveURL(url)` |

Locator translation matches Playwright Codegen's idiom: `role=button[name="Save"]` becomes `page.getByRole('button', { name: 'Save' })`, `text="Sign in"` becomes `page.getByText('Sign in')`, `[data-testid="x"]` becomes `page.getByTestId('x')`. Everything else falls back to `page.locator(rawSelector)`. The v0.5.1 `>> nth=N` disambiguator is stripped from the selector and chained as `.nth(N)` on the locator. String literals quote with single quotes when the value is plain ASCII without specials; fall back to `JSON.stringify` otherwise so escapes are correct.

**`webspec record-to-spec <recording.json>` CLI command** — `packages/cli/src/commands/record-to-spec.ts`. Reads the file, validates against `WorkflowRecordingSchema` (zod), renders, writes the spec next to the input by default (`recording.json` → `recording.spec.ts`) or to `--out` if given. `--test-name` overrides the default `test()` title. Validation failure returns exit 2 (caller-side); FS / runtime errors return exit 1.

**Golden tests** — 24 in `packages/core/tests/render/e2e/renderer.test.ts` covering every locator strategy, every event kind, every `navigate.reason`, string-quoting edge cases (single quotes, newlines), and a full TodoMVC-shaped fixture. 8 more in `packages/cli/tests/args.test.ts` for the new command's argument parser. 179/179 tests pass workspace-wide.

### New

- `packages/core/src/render/e2e/renderer.ts` — `renderPlaywrightSpec(recording: WorkflowRecording, opts?: RenderE2EOptions): string` plus internal helpers (`renderEvent`, `renderChange`, `renderNavigate`, `locator`, `baseExpr`, `splitNth`, `quote`).
- `packages/cli/src/commands/record-to-spec.ts` — `runRecordToSpec(cmd)` + `RecordToSpecInputError` for caller-side validation failures.
- `packages/cli/tests/args.test.ts` — 8 tests for the `record-to-spec` argument parser.
- `packages/core/tests/render/e2e/renderer.test.ts` — 24 golden tests across 5 describe blocks (header & scaffold, locator strategies, actions, navigation reasons, string quoting) plus a full fixture covering an in-order TodoMVC walkthrough.

### Changed

- `packages/core/src/index.ts` — export `renderPlaywrightSpec` and `RenderE2EOptions` from the Node entry point.
- `packages/core/src/browser.ts` — same exports for the Chrome bundle.
- `packages/cli/src/args.ts` — `ParsedArgs` widened with `RecordToSpecCommand`; new `parseRecordToSpec` sub-parser. Help text updated to document the new command + `--test-name` flag.
- `packages/cli/src/index.ts` — dispatch the new `'record-to-spec'` case; map `RecordToSpecInputError` to exit 2.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/e2e/renderer.ts` | New — deterministic renderer (`WorkflowRecording` → Playwright `.spec.ts` source). |
| `packages/core/tests/render/e2e/renderer.test.ts` | New — 24 golden tests covering the full event/strategy/reason matrix. |
| `packages/core/src/index.ts` | Export `renderPlaywrightSpec` + `RenderE2EOptions`. |
| `packages/core/src/browser.ts` | Same, for the browser bundle. |
| `packages/cli/src/commands/record-to-spec.ts` | New — `webspec record-to-spec` implementation with zod validation gate. |
| `packages/cli/src/args.ts` | Parse `record-to-spec` subcommand; extend `HELP_TEXT`. |
| `packages/cli/src/index.ts` | Dispatch the new subcommand; map input errors to exit 2. |
| `packages/cli/tests/args.test.ts` | 8 new tests for the `record-to-spec` arg parser. |
| `Versions/v0/v0.7.0/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: **179/179** tests pass (147 prior + 24 e2e renderer + 8 record-to-spec arg-parser). Type-check clean across `core` and `cli`. CLI builds clean.

#### End-to-end smoke

Two real-recording smokes pass:

**Select recording (v0.6.1 verification artifact).** A 3-event recording of three dropdown selections renders to:

```ts
import { expect, test } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('http://localhost:8765/select-test.html');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('ca');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('mx');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('us');
});
```

**Synthetic login + nav fixture.** A 7-event recording covering fill (with masked password), click, all three navigation reasons, and a hash-routing assertion renders to:

```ts
import { expect, test } from '@playwright/test';

test('recorded workflow', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('https://example.com/dashboard');
  await page.reload();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('https://example.com/dashboard/#/settings');
});
```

**Bad-input rejection.** `webspec record-to-spec` against a file that's valid JSON but not a `WorkflowRecording` exits with code 2 and prints the zod validation error pointing at the missing fields.

### What's next

- **v0.7.1** — Define the `AmplifiedRecording` zod schema in `@webspec/core` (`scenarios[]` with typed `actions[]` + `assertions[]`). No LLM yet; just the IR and zod validation, plus a hand-written golden fixture.
- **v0.7.2** — Wire the LLM amplifier. Prompt + Bedrock call + validated response → renderer extension that emits the negative scenarios as additional `test()` blocks.
- **v0.7.3** — Integration test. Local fixture under `tests/fixtures/playwright-target/`; spec compiles and the happy-path test passes against the fixture via the Playwright runner.
- **v1.0.0** — M6 done = v1 done.

