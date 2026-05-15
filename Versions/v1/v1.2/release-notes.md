# v1.2

## v1.2.0 — Test Library (2026-05-15)

### Problem

v1.1.0–v1.1.2 closed the recording → spec hand-off and captured the design for an on-disk test library, but the workflow still had sharp edges:

- Downloaded specs landed at the top of `~/Downloads/` with timestamp-stamped names that were hard to find again.
- Running a spec via `make run-spec` failed for any user-downloaded file (the bundled `tests/fixtures/recordings/playwright.config.ts` restricts `testDir`); `npx playwright test` from `~/Downloads/` failed because `@playwright/test` isn't installed there.
- No place to "see all your recorded tests" without Playwright UI — and no way to point Playwright UI at the saved tests without manual config plumbing.
- No way to associate a recording with a user identity for an authenticated app.

Each recording was a one-shot file pair; the user did all the bookkeeping.

### Solution

Implement the v1.2 slice of the design in `docs/08-test-library.md`:

**Save replaces Download.** The review-panel primary action now writes a per-test slug folder under `~/Downloads/webspec/<slug>/`:

```
~/Downloads/webspec/
  playwright.config.ts          ← write-once parent; Playwright UI reads this
  <slug>/
    recording.spec.ts           ← rendered spec, ready to run
    recording.json              ← raw WorkflowRecording, for re-rendering
    playwright.config.ts        ← per-test config (runnable in isolation)
```

`<slug>` is derived from the test name via `deriveSlug` (new pure util exported from `@webspec/core/browser`): lowercase, non-alphanumeric → `-`, collapse repeats, trim, cap at 64 chars. Collision handling for v1.2.0 is silent overwrite for per-test files; the parent config is write-once (best-effort detection via `chrome.downloads.search`).

**Naming form gains an optional Run as user field.** Captured into `WorkflowRecording.runAs: string | null` (new optional contract field). The renderer doesn't consume it yet — v1.3 wires it into an auth-injection step via a project-level `webspec.config.ts` (header injection by default, ModHeader-equivalent). Captured now so users don't have to re-record when v1.3 lands.

**New `make run-tests`.** Launches `playwright test --ui` against the parent config. The test tree shows every saved recording as a top-level entry (slug = folder name); Playwright UI provides the run buttons, traces, time-travel debugger, watch mode, and run history. **Playwright UI is the library + execution surface; we don't build an in-extension list.**

Also `make run-tests-ci` for headless one-shot runs.

### New

- `packages/core/src/library/slug.ts` — pure `deriveSlug(name)` utility. Exported from `@webspec/core/browser`. Browser-safe.
- `packages/core/tests/library/slug.test.ts` — 9 tests covering lowercase, non-alphanum collapse, trim, length cap, empty-input handling, digit preservation, defensive non-string guard.
- `WorkflowRecording.runAs: string | null` — new optional contract field (zod `.nullable().default(null)`); captured by the naming form, persisted in the recording, not yet consumed by the renderer.
- `App.tsx`: new `writeToWebspec` helper (overwrite-into-Downloads via `chrome.downloads`) and `ensureParentPlaywrightConfig` (write-once with best-effort search-based skip). `PER_TEST_PLAYWRIGHT_CONFIG` and `PARENT_PLAYWRIGHT_CONFIG` constants.
- `Makefile`: `run-tests` (Playwright UI against the saved library), `run-tests-ci` (headless one-shot). Both honor `WEBSPEC_LIBRARY` env var.

### Changed

- `packages/chrome-extension/src/popup/NamingForm.tsx` — gains a `runAs` field (optional). `onChange` and `onStart` callbacks now take three args.
- `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` — `onDownload` prop renamed to `onSave`; button label changes from "Download recording" to "Save".
- `packages/chrome-extension/src/popup/App.tsx` — `handleDownloadRecording` → `handleSaveRecording` (writes the slug-folder layout via `writeToWebspec` + ensures the parent config exists). `RecorderStatus` `naming` / `starting` / `recording` variants carry `runAs`; `saved` variant tracks `slug` not `filename`. The saved-state UI now reads "Saved to `~/Downloads/webspec/<slug>/`. Run `make run-tests` to open Playwright UI." Footer bumped to `v1.2.0 — test library`.
- `packages/chrome-extension/src/shared/messages.ts` — `RecorderStartRequest`, `RecorderSessionState`, `RecorderStatusResponse`, `RecorderStopResponse` all carry `runAs: string`.
- `packages/chrome-extension/src/content-script/index.ts` — module-scope `recorderRunAs`; `startRecorder` reads `req.runAs`, `stopRecorder` returns it, `persistSession` includes it, `bootstrapRecorder` restores it (with a defensive `?? ''` for sessions persisted by older builds), `getRecorderStatus` surfaces it.
- `packages/chrome-extension/src/popup/popup.css` — `.naming-form-optional` style for the "(optional)" hint next to "Run as user".
- `packages/core/src/types/analysis.ts` — `WorkflowRecordingSchema` gains optional `runAs` field.
- `packages/core/src/browser.ts` — re-exports `deriveSlug`.
- `README.md` — quickstart steps 4-6 rewritten for the v1.2 flow: Save (writes slug folder) → `make run-tests` (Playwright UI). Step 6 is now "Re-render with LLM amplification (optional)" pointing at `~/Downloads/webspec/<slug>/recording.json`.
- `Makefile` — `.PHONY` and help include `run-tests` / `run-tests-ci`.

### Fixed

- Workflow friction surfaced during v1.1 testing: timestamp-stamped filenames in `~/Downloads/` (hard to find), the `make run-spec` config restriction (didn't pick up arbitrary specs), the missing `@playwright/test` resolution outside the repo, and the absence of a "see all my tests" view.
- The pre-existing `make run-spec` shortcut survives unchanged for users still running individual rendered specs by hand; the new `make run-tests` is the modern path.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/library/slug.ts` | **New.** `deriveSlug(name)` pure utility. |
| `packages/core/tests/library/slug.test.ts` | **New.** 9 tests for the slug utility. |
| `packages/core/src/browser.ts` | Re-export `deriveSlug` from `@webspec/core/browser`. |
| `packages/core/src/types/analysis.ts` | `WorkflowRecordingSchema` gains optional `runAs: string \| null`. |
| `packages/chrome-extension/src/shared/messages.ts` | `runAs` threaded through `RecorderStartRequest`, `RecorderSessionState`, `RecorderStatusResponse`, `RecorderStopResponse`. |
| `packages/chrome-extension/src/content-script/index.ts` | Module-scope `recorderRunAs`; thread through start, stop, status, persist, bootstrap. |
| `packages/chrome-extension/src/popup/NamingForm.tsx` | Optional "Run as user" input. Three-arg `onChange` / `onStart`. |
| `packages/chrome-extension/src/popup/RecordingSummaryPanel.tsx` | `onDownload` → `onSave`; button label "Save". |
| `packages/chrome-extension/src/popup/App.tsx` | `handleSaveRecording` writes the slug-folder layout. `RecorderStatus` carries `runAs`; `saved` carries `slug`. Footer v1.2.0. New `writeToWebspec` / `ensureParentPlaywrightConfig` helpers + config constants. |
| `packages/chrome-extension/src/popup/popup.css` | `.naming-form-optional` style. |
| `Makefile` | `run-tests` (Playwright UI) + `run-tests-ci` (headless). |
| `README.md` | Quickstart steps 4-6 rewritten for the v1.2 flow. |
