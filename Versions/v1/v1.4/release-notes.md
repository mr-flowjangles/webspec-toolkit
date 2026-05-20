# v1.4

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
