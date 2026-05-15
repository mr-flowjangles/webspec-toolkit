# v1.1

## v1.1.2 — Test Library Design (2026-05-15)

### Problem

v1.1.0 + v1.1.1 closed the recording → spec hand-off, but the first real test run exposed bigger workflow gaps: downloaded files land at the top of `~/Downloads/` with timestamp-stamped names (hard to find), `make run-spec` doesn't work for arbitrary user specs (the bundled Playwright config restricts `testDir`), `npx playwright test` outside the repo fails because `@playwright/test` isn't installed there, and there's no notion of a *library* of recorded tests, no `runAs` user, no suites.

Rob's mental model: the extension should *author* a test (name, description, run-as user), and that test should *show up in a place where you can see and execute it* — like Playwright's UI Mode. The v1 product as shipped doesn't deliver that workflow.

### Solution

Design-only PR. New `docs/08-test-library.md` captures the post-v1 stack:

- **v1.2 — Test Library.** Files-on-disk are canonical at `~/Downloads/webspec/<slug>/recording.{spec.ts,json}` + per-test `playwright.config.ts`. The extension also writes a parent `~/Downloads/webspec/playwright.config.ts` (write-once) so `playwright test --ui` discovers every saved test. `make run-tests` launches that UI — **Playwright UI is the library + execution surface; we don't build an in-extension list.** The naming form gains an optional `runAs` field (captured-but-not-yet-rendered). The review-panel "Download" becomes "Save."
- **v1.3 — Auth Injection.** `runAs` becomes functional. New `webspec.config.ts` (in the user's repo) defines the auth mechanism — defaults to header injection (`mode: 'headers'`, ModHeader-equivalent) emitting `context.setExtraHTTPHeaders({ ... })` driven by `${username}`. Also supports `cookie`, `url`, `storageState`. Secrets via `${env.NAME}`.
- **v1.4 — Suites.** A `suite.json` at `~/Downloads/webspec/<suite-slug>/` lists `testSlugs: string[]` and renders to one `.spec.ts` with N `test()` blocks wrapped in `test.describe.serial(...)`. Suite creation is a Makefile / CLI action — keeps the extension a recorder.

In-tool execution (clicking Run inside Chrome) remains parked. Playwright can't run in a Chrome extension; bringing execution in-tool requires either a localhost daemon (rejected in `99-open-questions.md`) or a cloud runner. Playwright UI fills the gap fine.

### New

- `docs/08-test-library.md` — full design for v1.2 / v1.3 / v1.4.

### Changed

- `CLAUDE.md` — "How to read this repo" gains `08-test-library.md` as item 5; current-state paragraph adds a post-v1 direction note.
- `docs/00-overview.md` — reading order gains `08-test-library.md`; north-star direction now leads with the v1.2 → v1.4 stack.
- `docs/01-architecture.md` — Chrome extension surface description corrected (the extension *does* bundle the deterministic E2ERenderer, contra the pre-v1.1.0 prose) and notes the v1.2+ Save-to-slug-folder direction.
- `docs/02-contract-spec.md` — `WorkflowRecording` section notes the v1.2+ optional `runAs` field and points at `08-test-library.md`.
- `docs/07-build-plan.md` — new "Post-v1 stack" subsection captures v1.2 / v1.3 / v1.4 milestones.

### Fixed

Nothing in code — this is design.

### Files Changed

| File | Change |
|------|--------|
| `docs/08-test-library.md` | **New.** v1.2 / v1.3 / v1.4 design. |
| `CLAUDE.md` | Reading-order entry for the new doc; current-state paragraph mentions post-v1 direction. |
| `docs/00-overview.md` | Reading-order entry; north-star direction updated. |
| `docs/01-architecture.md` | Chrome extension surface description corrected + v1.2+ Save direction noted. |
| `docs/02-contract-spec.md` | `WorkflowRecording` section notes v1.2+ optional `runAs`. |
| `docs/07-build-plan.md` | New "Post-v1 stack" subsection. |

## v1.1.1 — Fix Spec Download Extension (2026-05-15)

### Problem

v1.1.0 wired `renderPlaywrightSpec` into the extension's Download button, but the rendered spec landed on disk as `recording-<ts>.spec.txt` instead of `.spec.ts`. Chrome's downloads API silently appends `.txt` to filenames when the blob's MIME type is `text/plain` and the extension isn't recognized as a text format. Caught at the first real recording (the `.json` companion was fine because Chrome trusts `application/json` and respects the `.json` extension).

The rendered content itself was correct — title from `recording.name`, description comment, all events translated. Only the filename was wrong, and `npx playwright test recording-*.spec.txt` won't pick the file up.

### Solution

Change the spec download's blob MIME type from `text/plain` to `application/octet-stream`. `octet-stream` tells Chrome to save the blob verbatim and respect whatever filename the extension provides; no extension coercion, no content sniffing. The JSON download keeps `application/json` since that path was already working.

### Fixed

- Extension Download now writes `recording-<ts>.spec.ts` (was `.spec.txt`). Spec is immediately runnable with `npx playwright test`.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/popup/App.tsx` | `downloadText(spec, …, 'text/plain')` → `'application/octet-stream'`. Footer version bumped to `v1.1.1`. |

## v1.1.0 — Named Test Case Recording (2026-05-15)

### Problem

Two gaps surfaced the day after v1.0.0 shipped:

1. **The extension's "Download recording" button only emitted raw `recording.json`** — it never invoked `renderPlaywrightSpec`, so the flagship recording → spec hand-off was not actually delivering a runnable spec to the user. The renderer was wired into `@webspec/core/browser` and bundled into the extension, but never called from the popup UI. The documented path was to render downstream via a CLI step (`webspec record-to-spec`), but no real user discovers that, and the friction defeats the shift-left framing.

2. **Recordings had no human-given identity.** The renderer defaulted the `test()` title to `'recorded workflow'` and there was nowhere for the user to capture the *intent* of what they were recording. That made the rendered specs anonymous, and it blocked the deferred per-scenario test report (which has nothing to key on without a name/description).

### Solution

**Extension renders the spec on download.** Wired `renderPlaywrightSpec` into the popup's download handler. Clicking Download in the review panel now writes two files in one go:

- `recording-<timestamp>.spec.ts` — the deterministic Playwright spec, ready to run with `npx playwright test`.
- `recording-<timestamp>.json` — the raw `WorkflowRecording` (kept so the recording can be re-rendered or sent through the LLM amplifier later).

**Intent capture before recording starts.** Clicking "Record workflow" now opens a small `NamingForm` panel with a required test name and description. The Start button is disabled until both fields have non-whitespace content. On submit, the values flow through the wire protocol (`recorder:start` → content script → `chrome.storage.session`) so they survive page reloads mid-recording, and are echoed back on `recorder:status` and `recorder:stop` so the popup can re-hydrate after being closed.

**Contract change.** `WorkflowRecording` gains required `name: z.string().min(1)` and `description: z.string().min(1)` fields. The renderer uses `recording.name` as the `test()` title and emits `recording.description` as a comment line (or several, for multi-line descriptions) at the top of the test body. The `testName` option survives as an explicit override path for tests that want to pin a title without minting a full recording.

### New

- `packages/chrome-extension/src/popup/NamingForm.tsx` — the pre-start form. Required name input + required description textarea + Start button gated on both fields.
- `naming` recorder state in `App.tsx` — transient pre-start state with the in-progress form values. Cancel returns to `idle`.
- Recording banner now reads "Recording **\<name\>**…" while capture is active, so the popup shows what's being recorded.
- Renderer tests for description-as-comment (single-line and multi-line).

### Changed

- `packages/core/src/types/analysis.ts` — `WorkflowRecordingSchema` gains required `name` and `description` fields.
- `packages/core/src/render/e2e/renderer.ts` — `renderPlaywrightSpec` uses `recording.name` as the `test()` title (with `opts.testName` as override) and emits `recording.description` as a `// `-prefixed comment block under the `test(` opener.
- `packages/chrome-extension/src/shared/messages.ts` — `RecorderStartRequest` carries `{ name, description }`; `RecorderSessionState`, `RecorderStatusResponse`, and `RecorderStopResponse` all carry them through so the popup can re-hydrate after a close/reopen or a page reload.
- `packages/chrome-extension/src/content-script/index.ts` — stashes name + description in module-scope and session state, returns them on stop, surfaces them on status.
- `packages/chrome-extension/src/popup/App.tsx` — new `naming` state, new download path that renders the spec via `renderPlaywrightSpec` and writes both `.spec.ts` and `.json`. `RecorderStatus` gains `name`/`description` on the `naming`, `starting`, and `recording` variants.
- `packages/chrome-extension/src/popup/popup.css` — styles for `.naming-form` (label stack, input/textarea styling, focus outlines, right-aligned start button).
- `packages/chrome-extension/src/popup/App.tsx` footer — version bumped to `v1.1.0 — named test case recording`.
- `packages/core/tests/fixtures/recordings/create-lead-ucm/recording.json` + `expected.spec.ts` — name + description added to the fixture, comment line added to the golden so the renderer output matches.
- Test fixtures that mint a `WorkflowRecording` in-line (renderer factory, amplifier prompt/analyzer tests, M6 integration test) updated for the new required fields.

### Fixed

- The flagship "record a workflow → get a runnable Playwright spec" path is now actually wired end-to-end through the extension UI. Previously it required a manual CLI step that wasn't surfaced anywhere.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Added required `name` + `description` to `WorkflowRecordingSchema`. |
| `packages/core/src/render/e2e/renderer.ts` | Title from `recording.name`; description emitted as comment lines. |
| `packages/core/tests/render/e2e/renderer.test.ts` | Factory carries name/description; new tests pin the comment behavior. |
| `packages/core/tests/render/e2e/amplification-pass.test.ts` | Fixture recording updated with name + description. |
| `packages/core/tests/analyze/amplify/prompt.test.ts` | Fixture recording updated with name + description. |
| `packages/core/tests/analyze/amplify/analyzer.test.ts` | Fixture recording updated with name + description. |
| `packages/core/tests/fixtures/recordings/create-lead-ucm/recording.json` | Added name + description. |
| `packages/core/tests/fixtures/recordings/create-lead-ucm/expected.spec.ts` | Added the matching description comment under the test opener. |
| `packages/cli/tests/integration/render-and-run.integration.test.ts` | Built `WorkflowRecording` updated with name + description. |
| `packages/chrome-extension/src/shared/messages.ts` | Added name/description to start request, session state, status response, stop response. |
| `packages/chrome-extension/src/content-script/index.ts` | Stash + restore + echo of name/description through the recorder lifecycle. |
| `packages/chrome-extension/src/popup/NamingForm.tsx` | **New.** Pre-start naming form. |
| `packages/chrome-extension/src/popup/App.tsx` | New `naming` state; download handler renders `.spec.ts` + `.json` via `renderPlaywrightSpec`. |
| `packages/chrome-extension/src/popup/popup.css` | Styles for the naming form. |
