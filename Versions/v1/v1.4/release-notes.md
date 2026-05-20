# v1.4

## v1.4.2 — Repo Bootstrap Files (2026-05-20)

### Problem

v1.4.0 + v1.4.1 wrote Test Cases and Queue specs into the configured Test repo folder, but if a user pointed webspec at a fresh empty folder, there was nothing to actually *run* what got written — no `package.json`, no root `playwright.config.ts`, no `.gitignore`. A teammate cloning the repo would land in a directory with `.spec.ts` files and no toolchain. This is the fourth and last MVP deliverable for v1.4 (`docs/10-team-shareability.md` § "v1.4 MVP scope" item 4).

### Solution

New `packages/chrome-extension/src/shared/bootstrap.ts` module + integration into both save sites (Test Case save in the popup, Queue save in the Settings panel).

**Detection.** `needsBootstrap(rootHandle)` returns `true` when the repo root lacks a `package.json`. That's the canonical signal for "fresh init" — a repo already wired up by a teammate will have one, and we never overwrite. Any unexpected probe error is treated as "can't tell, don't bootstrap" — safer to no-op than to risk clobbering existing setup we just failed to read.

**Confirmed write.** `ensureBootstrap(rootHandle, { confirm })` calls `needsBootstrap`; if `true`, awaits an injected `confirm()` callback; if the user agrees, writes the four scaffold files. Returns a discriminated result: `{ wrote: true }` / `{ wrote: false, reason: 'not-needed' | 'declined' }`. The confirm guard comes straight out of `docs/10` § "Implementation-detail questions" — webspec doesn't silently write files the user didn't ask for. Modeling `confirm` as an injected callback keeps `bootstrap.ts` UI-agnostic (popup, Settings, future surfaces can all supply their own prompt).

**Scaffolded files** (all exported as `BOOTSTRAP_*` constants so they can be inspected in code review):

- `package.json` — `private: true`, `type: 'module'`, scripts `test` + `test:ui`, `@playwright/test` pinned to `^1.60.0` (matches `packages/cli/package.json`, the repo's existing Playwright pin).
- `playwright.config.ts` — a single project with `testDir: '.'` and `testMatch: ['test-cases/**/*.spec.ts', 'tests/queue-*-*.spec.ts']`. One config picks up both directories — no per-folder Playwright project to maintain.
- `.gitignore` — `node_modules/`, `test-results/`, `playwright-report/`, `.DS_Store`, `*.log`.
- `README.md` — what the repo is, how to install + run, where Test Cases and Queues live.

**Save-time integration.** Both save sites call `ensureBootstrap(handle, { confirm: async () => confirm("...") })` right after they confirm permission and before they write their first file:

- `popup/App.tsx → trySaveToRepo` — the Test Case Save flow (v1.3.4).
- `settings/QueuesPanel.tsx → persist` — the Queue Save flow (v1.4.0 + v1.4.1).

Both surfaces show the same prompt copy: explains what webspec wants to write, lists the four files, asks Continue/Cancel. A user who declines still gets their primary file saved (the Test Case spec / the Queue manifest+spec) — the repo just lacks the toolchain for running them until they say yes on a later save or scaffold by hand.

This closes the v1.4 MVP per `docs/10` § "v1.4 MVP scope".

### New

- `packages/chrome-extension/src/shared/bootstrap.ts` — `needsBootstrap`, `ensureBootstrap`, plus the four `BOOTSTRAP_*` template constants and `EnsureBootstrapOptions` / `EnsureBootstrapResult` types.
- `packages/chrome-extension/tests/bootstrap.test.ts` — 11 tests against the fake `FileSystemDirectoryHandle` pattern: `needsBootstrap` (true / false / safe on probe error), `ensureBootstrap` (skips + never asks when not needed, writes all four on confirm, writes nothing on decline, written contents match exported constants), template-content sanity checks for each file (key strings present).

Total tests: 352/352 passing (+11 bootstrap).

### Changed

- `packages/chrome-extension/src/popup/App.tsx` — `trySaveToRepo` calls `ensureBootstrap` before writing the per-Test-Case files. Confirm prompt copy explains what webspec wants to write.
- `packages/chrome-extension/src/settings/QueuesPanel.tsx` — `persist` calls `ensureBootstrap` before `saveQueueWithSpec`. Same confirm prompt copy as the popup.

### Fixed

- N/A (additive).

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/bootstrap.ts` | **New** — bootstrap detection + write helper. |
| `packages/chrome-extension/tests/bootstrap.test.ts` | **New** — 11 unit tests. |
| `packages/chrome-extension/src/popup/App.tsx` | `trySaveToRepo` now calls `ensureBootstrap` first. |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | `persist` now calls `ensureBootstrap` before save. |
| `Versions/v1/v1.4/release-notes.md` | This entry. |

### Known issues / notes

- v1.4 milestone is now MVP-complete per `docs/10` § "v1.4 MVP scope": composer (v1.4.0) + renderer (v1.4.1) + repo path (v1.3.3 + v1.3.4) + bootstrap (this patch).
- `docs/07-build-plan.md` still has the v1.4 row listed as "post-v1 stack, not yet implemented" — should be flipped to "shipped" in a follow-up doc-only patch, or rolled into the v1.5 minor when planning begins.
- Manual verification needed in Chrome before declaring done: pick a fresh empty folder under General → Settings, save a recording from the popup (expect bootstrap prompt → 4 files appear), then save a Queue (expect no second prompt; `tests/queue-1-*.json` + `.spec.ts` appear).

## v1.4.1 — Queue Spec Renderer (2026-05-20)

### Problem

v1.4.0 shipped the Queue composer + manifest storage, but Saving a Queue produced only `queue-N-{slug}.json`. A teammate cloning the repo couldn't run anything — Playwright doesn't execute manifests; it needs `.spec.ts` source. The renderer is the second of v1.4's four MVP deliverables (`docs/10-team-shareability.md` § "v1.4 MVP scope" item 2).

### Solution

New pure renderer in `@webspec/core` plus a save-time wire-up that emits `queue-N-{slug}.spec.ts` alongside the manifest on every Save.

**Renderer (`packages/core/src/render/queue/renderer.ts`).** Public `renderQueueSpec({ queue, recordings, authProfiles }): string`. Output shape (locked by `docs/10` § "How a Queue renders to Playwright"):

- File-header comment naming the queue.
- `import { expect, test } from '@playwright/test';`
- One `test.describe.serial(queue.name, () => { ... })` — `.serial` keeps step order and reuses the browser context across steps.
- Optional `const <name> = '<value>';` lines at the top of the describe block, one per declared `queue.inputs[]` entry. v1.4 MVP only declares the constants; reuse + cross-step wiring is v1.5+.
- One `test('Step N — <testCase> (as <runAs>)' + ' × <iterations>' if > 1, async (...) => { ... })` per step — clear per-step failure attribution.
- Step bodies inline the recording: description as a leading comment, `await page.goto(recording.startUrl)`, then each `RecordedEvent` re-emitted through the existing `renderEvent` helper (now exported from `render/e2e/renderer.ts`). **No copy-paste of action translation** — the queue renderer composes with the existing event-emit code.
- `iterations > 1` wraps the step body in `for (let i = 0; i < <N>; i++) { ... }`.
- **Header-switching:** each step resolves headers via `matchProfile(authProfiles, recording.startUrl)` + `resolveProfileHeaders(profile, step.runAs)`, canonicalises the result, and emits `await context.setExtraHTTPHeaders({ ... })` only when the resolved headers differ from the prior step's. The `context` fixture is added to the `async ({ ... })` destructure only on steps that emit the call (otherwise just `{ page }`).
- Throws a clear error naming the step index + missing slug if `recordings` lacks an entry for any `step.testCase`.

**Save wire-up (`packages/chrome-extension/src/shared/queues.ts`).** Two new helpers:

- `loadRecordingsForQueue(rootHandle, queue)` — reads each unique `step.testCase` slug from `<repo>/test-cases/<slug>/recording.json`, returns the map `renderQueueSpec` expects. Throws with a specific message (missing directory, missing file, unparseable JSON) so the UI can surface what to fix.
- `saveQueueWithSpec(rootHandle, position, queue, authProfiles)` — runs `loadRecordingsForQueue` → `renderQueueSpec` → writes both the manifest (`saveQueueManifest`) and the spec (`<repo>/tests/queue-N-{slug}.spec.ts`). Returns the two paths. **The spec is overwritten on every Save** — the manifest is the editable source; never hand-edit the spec.

`QueuesPanel.tsx` now loads `AuthProfileList` via `loadProfiles()` at Save time and calls `saveQueueWithSpec` instead of `saveQueueManifest` alone. The tagline copy updated to reflect that Save produces both files.

**Re-exports (`packages/core/src/browser.ts` + `index.ts`).** `renderQueueSpec` + `RenderQueueSpecArgs` for the extension to consume. `renderEvent` (the previously-private helper in `render/e2e/renderer.ts`) is now exported with a doc comment explaining the reuse pathway.

### New

- `packages/core/src/render/queue/renderer.ts` — `renderQueueSpec` pure function (140 lines).
- `packages/core/tests/render/queue/renderer.test.ts` — 19 tests: scaffold (file header + imports + describe.serial), single-step inlining (goto + actions + description comment), two-step happy-path snapshot, header-switching matrix (same runAs → 1 call, different runAs → 2 calls, context fixture appearance conditional on the call), iterations (for-loop + title suffix), inputs (const declarations), error cases (missing slug → throws with step index).
- `packages/chrome-extension/src/shared/queues.ts` — added `loadRecordingsForQueue` + `saveQueueWithSpec`.

Total tests: 341/341 passing (+19 renderer).

### Changed

- `packages/core/src/render/e2e/renderer.ts` — `renderEvent` switched from `function` to `export function` so the queue renderer can reuse it without duplicating event-to-Playwright translation. No behavior change to the existing recording renderer; all 31 e2e renderer tests untouched.
- `packages/core/src/browser.ts` / `packages/core/src/index.ts` — re-export `renderQueueSpec` + `RenderQueueSpecArgs`.
- `packages/chrome-extension/src/settings/QueuesPanel.tsx` — Save calls `saveQueueWithSpec` (was `saveQueueManifest`); tagline updated.

### Fixed

- N/A (additive).

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/queue/renderer.ts` | **New** — `renderQueueSpec`. |
| `packages/core/src/render/e2e/renderer.ts` | Exported `renderEvent` for reuse. |
| `packages/core/src/browser.ts` | Re-exports renderer. |
| `packages/core/src/index.ts` | Re-exports renderer + Queue types. |
| `packages/core/tests/render/queue/renderer.test.ts` | **New** — 19 renderer tests. |
| `packages/chrome-extension/src/shared/queues.ts` | Added `loadRecordingsForQueue` + `saveQueueWithSpec`. |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | Wired Save to also emit the spec; tagline updated. |
| `Versions/v1/v1.4/release-notes.md` | This entry. |

## v1.4.0 — Queue Composer (2026-05-20)

### Problem

`docs/10-team-shareability.md` § "v1.4 MVP scope" calls for four deliverables: a Queue composer in the extension, a Queue → `.spec.ts` renderer, a configurable repo path, and bootstrap-files for an empty repo. v1.3.3 + v1.3.4 closed the repo-path half. The composer was still a `QueuesPanel.tsx` placeholder reading "Coming in v1.4" — there was no surface for picking Test Cases, ordering them into a Queue, or saving a manifest. Without it, the renderer (v1.4.1) and bootstrap (v1.4.2) had no input to consume.

### Solution

This patch lights up the **authoring** half of v1.4: the `Queue` contract artifact in `@webspec/core`, the storage layer that discovers Test Cases + reads/writes Queue manifests against the configured Test repo folder, and a full composer UI in the Settings → Queues tab.

**Contract artifact.** New `packages/core/src/library/queue.ts` defines `QueueSchema` (zod, `schemaVersion: 1`) plus `queueManifestFilename(n, slug)` / `queueSpecFilename(n, slug)` helpers. Steps are `{ testCase: slug, runAs: string, iterations?: number }`. Inputs are flat name/value pairs (the doc's "record_id constant" shape). The shape matches `docs/10` § 4 "Queue artifact on disk" — one `queue-<n>-<slug>.json` manifest per Queue under `<repo>/tests/`. Re-exported from `@webspec/core/browser` so the extension imports it through the same seam as `AuthProfile`.

**Storage layer.** New `packages/chrome-extension/src/shared/queues.ts` walks the user's `FileSystemDirectoryHandle`:

- `listTestCases(rootHandle)` scans `<repo>/test-cases/*/recording.json`, returning `{ slug, name, runAs }` summaries for the composer's Test Case picker. Skips directories without a parseable recording rather than failing the whole panel.
- `listQueues(rootHandle)` scans `<repo>/tests/` for files matching `queue-<n>-<slug>.json`, validates each through `QueueSchema`, and returns them in ascending position order. Malformed manifests are logged + skipped.
- `nextQueuePosition(existing)` returns `max(position) + 1` (or `1` when empty). The position number is what keeps the directory listing ordered and gives the renderer a stable 1:1 mapping between manifest and rendered spec.
- `saveQueueManifest(rootHandle, position, queue)` writes `<repo>/tests/queue-<position>-<slug>.json` through the v1.3.4 `writeFileToRepoFolder` helper (intermediate-directory creation, path-segment validation, writable-close-on-throw).

**Composer UI.** Replaced the `QueuesPanel.tsx` placeholder with a real panel that follows the `AuthProfilesPanel` shape (list + inline editor) so the surface feels consistent. Load flow:

1. If no Test repo folder is configured → empty state pointing at Settings → General.
2. If the folder is set but Chrome's permission has dropped to `prompt` / `denied` → empty state with a **Re-grant access** button that calls `requestPermission` mid-handler (user gesture, allowed).
3. If granted but the repo has no Test Cases → empty state pointing at the popup recorder.
4. Otherwise → list of saved Queues (numbered with their on-disk position) and a **+ New Queue** button.

The editor surfaces:

- A Queue **name** field (locked to the original slug when editing — re-create to rename, matching the doc's "no in-place editor" stance).
- A **Steps** fieldset with a row per step: Test Case dropdown (populated from `listTestCases`), `runAs` text input (pre-filled from the picked Test Case's recorded `runAs` per `docs/10` § 5), iterations number input (blank or `1` = no `× N`), up / down / × buttons.
- An optional **Inputs** fieldset with name/value rows for the flat constants the renderer can reference later.
- Validation refuses empty names, zero steps, missing Test Case picks, non-positive integers in iterations, and inputs with an empty name.
- On Save, the panel re-checks `queryPermission` (handle could have been revoked since panel-open), writes the manifest, and refreshes the list.

CSS additions (`.queue-list`, `.queue-row`, `.queue-position`, `.queue-step-row` + nested inputs/buttons) live alongside the existing `.profile-*` rules.

**Out of scope this patch.** No rendered `.spec.ts` yet — Saving produces only the `queue-N-{slug}.json` manifest. The renderer is v1.4.1. No bootstrap-files (`package.json`, root `playwright.config.ts`, `.gitignore`, `README.md`) yet — v1.4.2. No reuse of Test Case bodies across Queues — explicitly v1.5+. No edit-name flow — re-create to rename.

### New

- `packages/core/src/library/queue.ts` — `QueueSchema` + `QueueStepSchema` + `QueueInputSchema` + `queueManifestFilename` / `queueSpecFilename` helpers. Re-exported through `packages/core/src/browser.ts`.
- `packages/chrome-extension/src/shared/queues.ts` — `listTestCases`, `listQueues`, `nextQueuePosition`, `saveQueueManifest`, plus `TestCaseSummary` / `StoredQueue` types.
- `packages/chrome-extension/src/settings/QueuesPanel.tsx` — full composer (list + inline editor) replacing the v1.3.2 placeholder.
- `packages/core/tests/library/queue.test.ts` — 14 schema-validation tests (minimal valid, iterations rules, schemaVersion mismatch, empty-field rejection, inputs defaulting, filename helpers).
- `packages/chrome-extension/tests/queues.test.ts` — 15 storage tests against a fake `FileSystemDirectoryHandle` tree: `listTestCases` (missing dir, parseable / unparseable / missing-fields / sorted), `listQueues` (filename pattern matching, schema rejection, position ordering), `nextQueuePosition` (empty + max+1), `saveQueueManifest` (path construction + overwrite).
- `.queue-list` / `.queue-row` / `.queue-position` / `.queue-step-row` styles in `settings.css`.

Total test count: 322/322 passing.

### Changed

- `packages/core/src/browser.ts` — re-exports the new Queue surface.

### Fixed

- N/A (additive).

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/library/queue.ts` | **New** — `Queue` contract artifact. |
| `packages/core/src/browser.ts` | Re-exports the Queue surface. |
| `packages/core/tests/library/queue.test.ts` | **New** — schema + filename tests. |
| `packages/chrome-extension/src/shared/queues.ts` | **New** — Test Case discovery + Queue storage. |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | Replaced placeholder with the real composer. |
| `packages/chrome-extension/src/settings/settings.css` | Added `.queue-*` styles. |
| `packages/chrome-extension/tests/queues.test.ts` | **New** — storage-layer tests against a fake FS Access tree. |
| `Versions/v1/v1.4/release-notes.md` | This entry. |
