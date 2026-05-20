# v1.5

## v1.5.3 — Integration Tests for v1.5 Renderers (2026-05-20)

### Problem

The v1.5.0 helper-module renderer + the rewritten Queue renderer were covered by unit tests (snapshots of the emitted strings, schema validation, error cases), but nothing actually compiled and ran the generated TypeScript. A typo in the renderer that produced syntactically-broken code would have passed every existing test and only surfaced when a user ran `npx playwright test` against the rendered output. The existing M6 integration test (`render-and-run.integration.test.ts`) closes that loop, but only for the old v0.7.0 inline path (`renderPlaywrightSpec`) — not for the new v1.5 surfaces.

### Solution

New `packages/cli/tests/integration/render-v1-5-helpers.integration.test.ts` with three integration tests that render the v1.5 outputs to a temp directory, lay them out in the exact on-disk shape the extension produces, and run `npx playwright test` against them:

1. **Test Case helper-module path.** `renderTestCaseModule` writes `recording.ts`; `renderTestCaseSpec` writes the thin `recording.spec.ts` wrapper that imports `run` from `./recording.js`. Runs against the `form.html` fixture from M6. Confirms the generated module compiles, the spec resolves the import (Playwright TS loader handles `.js` → `.ts`), and the recorded events execute.
2. **Queue renderer happy path.** Two recordings (`fills-the-form` + `submits-the-form`) become two Test Case helper modules, then `renderQueueSpec` produces `tests/queue-1-form-smoke.spec.ts` that imports both via slug-derived camelCase aliases (`fillsTheForm`, `submitsTheForm`). Playwright runs the queue spec; both step `test()` blocks pass.
3. **Iterations.** A Queue with `iterations: 3` on its single step renders the `for (let i = 0; i < 3; i++)` wrapper around the helper call. Sanity-checks the rendered source for the loop and confirms the spec runs.

All three tests share the same `tests/fixtures/playwright-target/form.html` fixture as M6 so we didn't have to author new HTML. The temp dir layout mirrors what the extension writes to a real repo:

```
.tmp-v1-5/
├── helper-module/
│   ├── playwright.config.ts
│   └── test-cases/fills-the-form/
│       ├── recording.ts
│       └── recording.spec.ts
├── queue/
│   ├── playwright.config.ts
│   ├── test-cases/fills-the-form/recording.ts
│   ├── test-cases/submits-the-form/recording.ts
│   └── tests/queue-1-form-smoke.spec.ts
└── queue-iterations/
    ├── playwright.config.ts
    ├── test-cases/submits-the-form/recording.ts
    └── tests/queue-1-iterated-submit.spec.ts
```

Each test gets a fresh sub-directory so a failure leaves a debuggable artifact behind without poisoning the next run. Same per-test timeout (60s) as M6.

**Test setup.** The shared `writeTestCase` helper handles the `test-cases/<slug>/` write so the two body tests don't repeat layout boilerplate. The `runPlaywright` + `failWithRunnerOutput` helpers surface the runner's stdout/stderr on failure — without them a renderer regression would show only "exit code 1" and you'd have to instrument manually.

**Why this matters now.** v1.5.0 + v1.5.1 shipped on the back of unit tests only. The manual test plan was the safety net catching any rendered-code compile issues. With these integration tests, future renderer changes (v1.6+ input/output wiring, AI variation amplification, secrets-aware rewriter) get a CI gate before they can land — Rob's manual test pass becomes a confirmation step rather than the first time the generated code is exercised.

### New

- `packages/cli/tests/integration/render-v1-5-helpers.integration.test.ts` — 3 integration tests (helper-module path, queue happy path, queue iterations).
- `.gitignore` gains `**/tests/integration/.tmp-*/` to cover the prefixed temp dirs the new test uses (the existing `.tmp/` pattern stays as-is for the M6 test).

Total tests: 384/384 passing (+3 integration).

### Changed

- N/A — additive only.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/cli/tests/integration/render-v1-5-helpers.integration.test.ts` | **New** — 3 integration tests. |
| `.gitignore` | Added `**/tests/integration/.tmp-*/` for the new prefixed temp dirs. |
| `Versions/v1/v1.5/release-notes.md` | This entry. |

### Known issues / notes

- These tests share the M6 prereq: Chromium must be installed via `npx playwright install chromium` before the suite passes. CI runners that don't pre-install will see a clean Playwright error and fail loudly.
- Total runtime impact: ~5s added to `pnpm test` (three Playwright launches). Acceptable for the coverage gained.

## v1.5.2 — Manual Test Plan (2026-05-20)

### Problem

v1.4 + v1.5 shipped a lot of surface area in rapid succession (six PRs in one session). The release notes' "Known issues / notes" sections each carried a "manual verification needed" line, but the steps were scattered across five separate entries. Doing the verification meant flipping between docs and reassembling the order yourself. A standalone, ordered, checkbox-driven test plan removes that friction and gives a permanent reference future patches can append to.

### Solution

New `docs/manual-test-plan.md` — 8 sequential sections walking the full v1.4 + v1.5 contract end-to-end. Each section has actionable steps with checkboxes and a clear "expect" assertion, and the sections share state (the same `~/code/webspec-test-repo` folder, the same Test Case, the same Queue) so completing them in order verifies the full record → compose → render → push → CI flow without re-doing setup.

**Coverage:**

1. Prereqs — pull, build, load unpacked, prep parent dir.
2. Settings → General Test repo folder picker (v1.3.3 baseline).
3. Queues tab empty states (v1.4.0).
4. Record + save first Test Case → bootstrap prompt with 5 files → 4 files written under `test-cases/<slug>/` including `recording.ts` AND `recording.spec.ts` (v1.5.0 helper shape).
5. Standalone Test Case spec runs (`npm install && npx playwright install && npm test`).
6. Compose + save a Queue → `tests/queue-N-<slug>.{json,spec.ts}` written; spec uses `import { run as ... }` not inlined events; iterations wrap the call (v1.4.0 + v1.4.1 + v1.5.0).
7. Decline-bootstrap fallback path (v1.4.2 edge case).
8. Self-heal for pre-v1.5.0 Test Cases (delete `recording.ts`, re-save Queue, watch it regenerate).
9. Push to a fresh GitHub repo, watch Actions run green, download the Playwright HTML report artifact (v1.5.1 — the big CI surface payoff).

Each section ends with a concrete "if broken" hint pointing at the most likely failure mode (Chrome blocking the Desktop / Downloads / Documents picker, CI failing on a dependency install, etc.) and a final "cleanup" section so the test pass leaves no residue.

Doc-only patch — no code changes. Future verification rounds can edit this file in place rather than rewriting it from scratch each time.

### New

- `docs/manual-test-plan.md` — the full 8-section ordered checklist.

### Changed

- N/A.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `docs/manual-test-plan.md` | **New** — manual verification checklist for v1.4 + v1.5. |
| `Versions/v1/v1.5/release-notes.md` | This entry. |

## v1.5.1 — CI Surface (2026-05-20)

### Problem

v1.4 + v1.5.0 made the Test repo "team-runnable" in shape (`npm install && npm test` works once a teammate clones), but no team actually runs tests by manually pulling and typing commands. The natural surface is CI — push to `main` or open a PR and the tests just run. `docs/10` § "v1.5+ futures" had this as #4 ("doc + a sample workflow file, not a build artifact") and it's the smallest unit between the current state and "the team is actually using this."

### Solution

A fifth scaffold file in the v1.4.2 bootstrap set: `.github/workflows/playwright.yml`. Same `BOOTSTRAP_*` template pattern, same `ensureBootstrap` confirmed-write flow.

**Workflow shape** (`BOOTSTRAP_GITHUB_WORKFLOW` in `packages/chrome-extension/src/shared/bootstrap.ts`):

- Triggers: `push` + `pull_request` to `main`, plus `workflow_dispatch` for manual reruns.
- Single `ubuntu-latest` job, 30-min timeout.
- `actions/checkout@v4` → `actions/setup-node@v4` (Node 20) → `npm ci` → `npx playwright install --with-deps chromium` → `npm test`.
- `actions/upload-artifact@v4` with `if: always()` uploads the Playwright HTML report (`playwright-report/`) for 14 days, regardless of pass/fail. A failed CI run is debuggable from the Actions tab without rerunning locally.
- **Chromium only.** Firefox + WebKit add ~10 min and aren't part of v1's golden-path mission. The matrix-build option is banked for v1.7+.

**`ensureBootstrap` now writes a fifth file.** The `.github/workflows/` intermediate directory is created on the fly by `writeFileToRepoFolder` (the v1.3.4 helper handles nested directory creation already).

**Confirm prompt copy updated.** Both save sites (popup `trySaveToRepo` and `QueuesPanel persist`) now list five files in the confirmation: `package.json, playwright.config.ts, .gitignore, README.md, and .github/workflows/playwright.yml`. No change to when the prompt fires (still gated on `needsBootstrap`, still keyed off the absence of `package.json` at repo root).

**README CI section.** `BOOTSTRAP_README` gains a `## CI` section that:

- Describes what the workflow does (runs on push + PR to `main`, plus on-demand) and how to read the report artifact.
- Calls out the secrets caveat explicitly — recorded auth headers are committed in `recording.json` and in the `setExtraHTTPHeaders` calls in the rendered specs. The caveat documents the two options for credential-bearing recordings: hand-edit the workflow / specs to use `${{ secrets.NAME }}` references and add the secret in GitHub, OR keep CI scoped to a sandbox / synthetic-data environment.
- Flags that production credentials should NEVER be committed and that an automated "secrets-aware rewriter" is on the post-v1.5 roadmap.

**Out of scope (v1.6+).** No secret rewriting — the workflow runs recordings as-is. No matrix builds. No incremental "run only changed Queues." No GitHub Enterprise variant — the toolkit's standing rule is `github.com` only.

**Re-scaffold caveat.** `needsBootstrap` still keys off `package.json`. A repo bootstrapped pre-v1.5.1 (has `package.json`, no workflow) won't get the workflow auto-added on the next save — same migration model as the rest of the bootstrap set. Documented in `docs/10` § "v1.5.1 — CI Surface" → "Re-scaffold semantics."

**Design captured.** `docs/10-team-shareability.md` gained a "v1.5.1 — CI Surface (design locked, 2026-05-20)" section above the futures list. The futures list moved CI to ✅ and demoted Input/output wiring + AI variation amplification one slot each. A new bullet 5 records the deferred secrets-aware rewriter idea.

### New

- `BOOTSTRAP_GITHUB_WORKFLOW` template constant in `packages/chrome-extension/src/shared/bootstrap.ts` — the Playwright Actions workflow.
- `BOOTSTRAP_README` gains a `## CI` section (workflow description + secrets caveat).
- `packages/chrome-extension/tests/bootstrap.test.ts` gains 2 template-content tests (README CI section, workflow shape — checkout v4, setup-node v4, Node 20, npm ci, playwright install chromium, upload-artifact, `if: always()`).
- `docs/10-team-shareability.md` § "v1.5.1 — CI Surface (design locked, 2026-05-20)".

Total tests: 381/381 passing (+2 over v1.5.0).

### Changed

- `packages/chrome-extension/src/shared/bootstrap.ts` — `ensureBootstrap` writes a fifth file at `.github/workflows/playwright.yml`.
- `packages/chrome-extension/src/popup/App.tsx` + `packages/chrome-extension/src/settings/QueuesPanel.tsx` — confirm prompt lists five files instead of four.
- `packages/chrome-extension/tests/bootstrap.test.ts` — `ensureBootstrap` "writes all" test renamed and updated to assert five files (four at root + nested workflow); "matches template constants" test asserts the workflow contents too.
- `docs/10-team-shareability.md` § "v1.5+ futures" — CI surface promoted to ✅ shipped; secrets-aware rewriter added as a new line item.

### Fixed

- N/A (additive).

### Files Changed

| File | Change |
|------|--------|
| `docs/10-team-shareability.md` | New v1.5.1 design section; updated futures list. |
| `packages/chrome-extension/src/shared/bootstrap.ts` | Added `BOOTSTRAP_GITHUB_WORKFLOW`; `ensureBootstrap` writes 5 files; README updated with CI section. |
| `packages/chrome-extension/src/popup/App.tsx` | Confirm prompt mentions 5 files. |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | Same. |
| `packages/chrome-extension/tests/bootstrap.test.ts` | Updated for 5-file scaffold; added 2 new template tests. |
| `Versions/v1/v1.5/release-notes.md` | This entry. |

### Known issues / notes

- Manual verification carries forward: fresh empty folder → save → 5 files appear (including `.github/workflows/playwright.yml`); push the repo to GitHub → Actions tab shows the workflow running and uploading the report.
- The workflow assumes the repo is on `github.com` (the toolkit's standing rule). A GitHub Enterprise variant isn't a planned feature.
- Pre-v1.5.1 repos won't auto-add the workflow on next save (no signal — `package.json` exists). Workaround: delete `package.json` and re-trigger a save, or copy the workflow from a fresh scaffold. Banked for the "secrets-aware rewriter" milestone, which will need a broader re-scaffold story anyway.

## v1.5.0 — Reusable Test Cases (2026-05-20)

### Problem

v1.4 MVP knowingly inlined each Test Case's recorded events into every Queue spec that referenced it: if `create-lead` was a step in Queue A and Queue B, the body lived twice. Painful at 8+ queues, and a maintenance trap — fix a selector in `create-lead` and you have to remember to re-render every Queue using it. `docs/10` § "v1.5+ futures" called Reusable Test Cases out as #1 in the priority list for exactly this reason.

### Solution

Each Test Case now ships as a helper module that Queue specs **import** instead of inlining. Single source of truth per Test Case: edit it once → every Queue picks up the fix on its next render.

**New on-disk layout** under `<repo>/test-cases/<slug>/`:

```
recording.json          # raw WorkflowRecording (unchanged)
recording.ts            # NEW — exports `async function run({ page, context })`
recording.spec.ts       # CHANGED shape — thin wrapper that imports run() and applies recorded auth
playwright.config.ts    # per-test config (unchanged)
```

**Helper module (`recording.ts`).** New `renderTestCaseModule(recording)` in `@webspec/core` emits a TypeScript module with one named export: `async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void>`. The body is the recording's `page.goto(startUrl)` + each `RecordedEvent` re-emitted via the shared `renderEvent` helper. **The helper does NOT touch headers** — auth is the caller's concern. That keeps the helper reusable across contexts: the standalone Test Case spec applies the recording's baked-in `recording.auth` headers; Queue specs apply the resolved per-step `AuthProfile` headers (which can differ per step).

**Thin Test Case spec wrapper (`recording.spec.ts`).** New `renderTestCaseSpec(recording)` emits `import { test } from '@playwright/test'; import { run } from './recording.js';` then one `test()` that optionally sets baked-in auth headers and calls `await run({ page, context })`. The Test Case stays standalone-runnable via `npx playwright test`. The import uses `.js` because that's what Playwright's TS loader resolves to the `.ts` source under NodeNext / ESM.

**Queue renderer rewrite (`renderQueueSpec`).** Step bodies stop inlining. Imports gather at the top of the spec, deduped per unique slug, sorted alphabetically for stable diffs:

```ts
import { run as createLead } from '../test-cases/create-lead/recording.js';
import { run as fillDetails } from '../test-cases/fill-details/recording.js';
```

Step `test()` blocks become:

```ts
test('Step 1 — create-lead (as ANALYST01)', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ uid: 'ANALYST01' });
  await createLead({ page, context });
});
```

The import alias is a slug-derived camelCase identifier (`create-lead` → `createLead`) via a new `slugToIdentifier` helper in `@webspec/core/library/slug`. Iterations wrap the helper call, not the inlined events. Header-switching semantics (set headers only when the resolved set changes between steps) are unchanged. The Queue renderer still consumes `recordings` because `recording.startUrl` drives `matchProfile`, even though the events themselves now live in the imported helper.

**Self-heal at Queue render time.** Test Cases saved pre-v1.5.0 have only the inlined `recording.spec.ts` shape and no `recording.ts`. Rather than ship a migration script, `saveQueueWithSpec` calls a new `ensureTestCaseHelpers(rootHandle, recordings)` step before rendering: for every referenced slug, if `recording.ts` is missing, render it from the corresponding `recording.json` and write it. Saves both the spec and re-saves of the spec are now self-healing — no manual migration. Existing `recording.ts` files are left alone (the user may have hand-edited).

**Popup save updated.** The Test Case save flow (`popup/App.tsx → trySaveToRepo`) writes all four files for both repo and Downloads paths. The signature added a `helperModule` argument; both branches use `renderTestCaseModule` + `renderTestCaseSpec`.

**Design captured.** `docs/10-team-shareability.md` gained a "v1.5.0 — Reusable Test Cases (design locked, 2026-05-20)" section above the futures list, covering file layout, helper signature, Queue renderer change, path resolution (`../test-cases/<slug>/recording.js`), the rename-coupling tradeoff, and the self-heal strategy.

### New

- `packages/core/src/render/test-case/renderer.ts` — `renderTestCaseModule` + `renderTestCaseSpec` pure functions.
- `packages/core/tests/render/test-case/renderer.test.ts` — 13 tests (module structure, run() signature, JSDoc, no-headers invariant, inline snapshot; spec wrapper imports + auth header conditional).
- `packages/core/src/library/slug.ts` gains `slugToIdentifier(slug)` — kebab → camelCase, digit-leading guard.
- `packages/core/tests/library/slug.test.ts` gains 6 `slugToIdentifier` tests.
- `packages/chrome-extension/src/shared/queues.ts` gains `ensureTestCaseHelpers(rootHandle, recordings)` — self-heals missing `recording.ts` files from `recording.json`.
- `packages/chrome-extension/tests/queues.test.ts` gains 6 tests covering `ensureTestCaseHelpers`, `loadRecordingsForQueue`, and the self-heal integration in `saveQueueWithSpec`.

Total tests: 379/379 passing (+38 over v1.4.3's 341).

### Changed

- `packages/core/src/render/queue/renderer.ts` — rewritten to emit imports + helper calls instead of inlining recorded events. Old golden test snapshots replaced with new ones reflecting the import-based shape.
- `packages/core/tests/render/queue/renderer.test.ts` — full rewrite to match the new output. New tests for import dedup, alphabetical import sort, and `{ page, context }` always being destructured.
- `packages/core/src/browser.ts` + `packages/core/src/index.ts` — re-export `renderTestCaseModule`, `renderTestCaseSpec`, and `slugToIdentifier`.
- `packages/chrome-extension/src/popup/App.tsx` — Test Case save renders both `recording.ts` (helper) and `recording.spec.ts` (thin wrapper); `trySaveToRepo` signature now takes the helper module as a separate argument.
- `packages/chrome-extension/src/shared/queues.ts` — `saveQueueWithSpec` calls `ensureTestCaseHelpers` before rendering; result type adds `healedHelpers: string[]` for UI reporting.
- `docs/10-team-shareability.md` — added the locked v1.5.0 design section.

### Fixed

- N/A (additive + refactor; no bug fixes).

### Files Changed

| File | Change |
|------|--------|
| `docs/10-team-shareability.md` | **New section** — v1.5.0 design locked. |
| `packages/core/src/render/test-case/renderer.ts` | **New** — Test Case helper-module + thin-spec renderers. |
| `packages/core/tests/render/test-case/renderer.test.ts` | **New** — 13 tests. |
| `packages/core/src/library/slug.ts` | Added `slugToIdentifier`. |
| `packages/core/tests/library/slug.test.ts` | Added 6 `slugToIdentifier` tests. |
| `packages/core/src/render/queue/renderer.ts` | Rewritten — emits imports + helper calls. |
| `packages/core/tests/render/queue/renderer.test.ts` | Rewritten to match new output. |
| `packages/core/src/browser.ts` | Re-exports new renderers + `slugToIdentifier`. |
| `packages/core/src/index.ts` | Same. |
| `packages/chrome-extension/src/shared/queues.ts` | Added `ensureTestCaseHelpers`; `saveQueueWithSpec` self-heals. |
| `packages/chrome-extension/tests/queues.test.ts` | Added 6 self-heal / load tests. |
| `packages/chrome-extension/src/popup/App.tsx` | Test Case save writes both `recording.ts` and `recording.spec.ts`. |
| `Versions/v1/v1.5/release-notes.md` | This entry. |

### Known issues / notes

- **Manual verification still pending** (carried forward from v1.4.2 + this patch): fresh empty folder → save a Test Case → expect `recording.ts` + new thin `recording.spec.ts` + bootstrap prompt + 4 files. Save a Queue with that Test Case → expect a queue spec that compiles (`npx playwright test`) and the inlined-import shape (`await createLead({ page, context })`).
- **Pre-v1.5.0 Test Cases work transparently** thanks to the self-heal: open a Queue using one, hit Save, and `recording.ts` appears.
- **Rename coupling acknowledged.** Renaming a Test Case slug (not implemented as UI yet) would break existing Queue spec imports until the user re-renders. Not a v1.5.0 concern; design note in `docs/10`.
- **Next up: v1.5.1 input/output wiring** — Test Cases declare outputs (`createLead → { leadId }`), Queues wire them between steps. The helper signature is fixed at `{ page, context }` for now.