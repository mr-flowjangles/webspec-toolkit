# v1.3

## v1.3.1 — Queues Design Decisions (2026-05-17)

### Problem

`docs/10-team-shareability.md` settled the v1.4 mission (Test Cases + Queues + team-runnable specs in a shared git repo) but left six open questions for the build session, including the big-shape ones: where Queue composition lives in the extension, how the repo path is configured, what storage actually syncs across teammates, and how step roles get named. Without answering those, v1.4 implementation can't start without a code-time fork in the road.

### Solution

Held a focused design session and locked five of the six. Captured in a new **Build-session decisions (2026-05-17)** section in `docs/10`, with rationale and rejected alternatives for each:

1. **Queue composer = sibling section in the existing Settings page.** Reuses `packages/chrome-extension/src/settings/`; faster ship than a new HTML entry or detached window.
2. **Repo path = one global "Test repo folder"** setting per Chrome profile, picker via the File System Access API, fallback to `~/Downloads/webspec/`. Per-app-by-URL-pattern model considered and rejected — premature.
3. **Sync = GitHub.** The team repo IS the source of truth. No AWS service, no local SQLite. WASM SQLite (sql.js / SQLite-WASM in IndexedDB) explicitly evaluated for the "queryable authoring DB" use case and rejected because manifests have to live in the repo regardless.
4. **Queue artifact = two files** in `<repo>/tests/` — `queue-N-{slug}.json` (source of truth) + `queue-N-{slug}.spec.ts` (regenerable). Manifest-as-header-comment and manifest-in-`chrome.storage.local` shapes both rejected.
5. **Step role = raw `runAs` value** on each step. No new "Roles" registry; the auth profile's `${runAs}` substitution already covers it. Composer pre-fills `runAs` from the Test Case's recorded value and lets the user override per step.
6. **Existing `~/Downloads/webspec/`** library is left alone. New saves with a repo configured go to the repo; users hand-copy if they want to migrate old recordings.

The remaining open item (slug collisions between authors saving the same Test Case name) stays deferred because v1.4 ships single-author. Three implementation-detail questions (iterations input placement, re-render behavior on Test Case edit, bootstrap-files confirmation UX) were moved into a new "Implementation-detail questions" section in `docs/10` and will be settled at build time.

### New

- `docs/10-team-shareability.md` § Build-session decisions (2026-05-17) — full record of the five locked decisions with rejected alternatives.
- `docs/10-team-shareability.md` § Implementation-detail questions for the build session — replaces the prior open-questions section with the smaller items that don't change the design shape.

### Changed

- `docs/10-team-shareability.md` § Status — flipped from "active design" to "design locked, implementation queued."

### Fixed

- N/A (docs-only patch.)

### Files Changed

| File | Change |
|------|--------|
| `docs/10-team-shareability.md` | Added Build-session decisions section. Replaced Open questions with shorter Implementation-detail questions. Updated Status. |
| `Versions/v1/v1.3/release-notes.md` | This entry. |

## v1.3.0 — Domain-Aware Auth Profiles (2026-05-15)

### Problem

v1.2 made the recording → spec workflow real, but the first test recorded against a Bellese app failed immediately. Playwright launches its own fresh Chromium context for each run — incognito, no extensions, no ModHeader. Without the `uid` header that UCM (and similar Bellese apps) use as a dev backdoor, the test browser hits the live URL anonymously and never gets past the first authenticated page. The runtime is fine; the workflow is unusable for any real internal app.

### Solution

A **domain-aware auth profile** system, configured per Chrome profile via a new Settings tab in the extension. The design pivot from the original `docs/08` (where config lived in a `webspec.config.ts` at the user's repo root) was driven by v1.2 first-use feedback — the workflow is browser-centric and adding a repo-bound config means walking to a terminal, which defeats shift-left.

How it works:

1. **One-time setup.** Open the new **⚙ Settings** button on the popup. Click **+ Add profile**. Set a name (e.g. "UCM Dev"), a URL pattern (glob — `http://app.ucm-dev.cmscloud.local/*`), and N header rows (e.g. `uid` → `${runAs}`). Save.
2. **Recording.** Click **Record workflow** as before. The popup matches the active tab's URL against your profiles. If a profile matches, the naming form shows ✓ **Auth profile: UCM Dev**. If none match, the form shows "No auth profile matches this URL — spec will run unauthenticated."
3. **Save.** The matched profile's headers are resolved (substituting `${runAs}` with the recording's run-as user) and baked into `WorkflowRecording.auth`. Spec is self-contained.
4. **Render.** When `recording.auth` is present, the rendered spec destructures `context` from the Playwright fixture and emits `await context.setExtraHTTPHeaders({ ... })` between the description comment and `page.goto`. The test browser is now authenticated — same way ModHeader authenticates your real browser.

Per-Chrome-profile, not per-repo. No CLI step. Multi-app supported via multiple profiles with distinct URL patterns; the most-specific match wins.

### New

- `packages/core/src/library/auth-profile.ts` — `AuthProfile` / `AuthProfileList` zod schemas; `matchProfile(profiles, url)` (longest-pattern wins); `resolveProfileHeaders(profile, runAs)` substitutes `${runAs}` placeholders.
- `packages/core/src/library/url-glob.ts` — `matchesUrlGlob(pattern, url)` pure utility. `*` → `.*`, all other regex metacharacters escaped, fully anchored. Browser-safe.
- `packages/core/tests/library/url-glob.test.ts` — 8 tests covering wildcard placement, escaping, anchoring, empty input, non-string input.
- `packages/core/tests/library/auth-profile.test.ts` — 10 tests for `matchProfile` (most-specific wins, empty list, no match) and `resolveProfileHeaders` (substitution, case-insensitivity, multiple occurrences, empty headers).
- `packages/core/tests/render/e2e/renderer.test.ts` — 5 new tests for auth emission (omit when null, emit with context fixture, ordering, multiple headers, empty headers treated as no-auth).
- `WorkflowRecording.auth` — new optional contract field with `profileName` + resolved `headers` map. Null when no profile matched, when the user has none configured, or for pre-v1.3 recordings.
- `packages/chrome-extension/src/settings/` — full Settings page (HTML entrypoint, React app, CSS). Add/edit/delete profiles, inline editor with name + URL pattern + N-row header table.
- `packages/chrome-extension/src/shared/profiles.ts` — `loadProfiles` / `saveProfiles` / `blankProfile` chrome.storage.local accessors. Reads are zod-validated.
- New **⚙ Settings** button on the popup's idle screen → opens `chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/index.html') })`.

### Changed

- `packages/core/src/render/e2e/renderer.ts` — `renderPlaywrightSpec` emits `async ({ page, context })` and `await context.setExtraHTTPHeaders({ ... })` when `recording.auth` is non-null. No auth block emitted when `recording.auth` is null OR `headers` is empty.
- `packages/core/src/types/analysis.ts` — `WorkflowRecordingSchema` adds optional `auth: { profileName: string; headers: Record<string, string> } | null` field.
- `packages/core/src/browser.ts` — re-exports `matchProfile`, `resolveProfileHeaders`, `matchesUrlGlob`, and the auth schemas.
- `packages/chrome-extension/src/popup/App.tsx` — recorder state's `naming`/`starting`/`recording` variants carry `matchedProfile: AuthProfile | null`. `handleRecordToggle` becomes async, looks up the active tab URL + loaded profiles, matches before entering naming state. `stopAndReviewRecording` resolves the matched profile's headers and bakes `recording.auth` at stop time. `hydrateRecorderStatus` re-matches against `recording.startUrl` when restoring an in-flight session. New Settings button (⚙) opens the settings tab.
- `packages/chrome-extension/src/popup/NamingForm.tsx` — accepts `matchedProfile` prop; renders a non-blocking auth hint (✓ matched profile name, or "No auth profile matches…").
- `packages/chrome-extension/src/popup/popup.css` — styles for `.naming-form-auth-hint`, `.naming-form-auth-ok`, `.naming-form-auth-none`, `.settings-btn`.
- `packages/chrome-extension/vite.config.ts` — `rollupOptions.input` adds `settings: 'src/settings/index.html'`.
- `packages/chrome-extension/manifest.config.ts` — `web_accessible_resources` includes the settings page.
- `packages/chrome-extension/src/popup/App.tsx` footer — bumped to `v1.3.0 — domain-aware auth profiles`.
- `docs/08-test-library.md` — v1.3 section rewritten for the extension-Settings-driven model (replacing the original repo-bound `webspec.config.ts` design).

### Fixed

- The auth gap from v1.2 — tests recorded against authenticated Bellese apps now actually run authenticated, no terminal step required.
- **Selector hardening for nested-text elements.** UCM live-test surfaced a recorder limitation: clicking on a deep decorative descendant of an interactive element (e.g. a `<mat-icon>` inside a `[role=menuitem]`) produced positional CSS selectors like `div >> nth=369` that broke the moment the DOM shifted. The hardener now walks up to 5 levels looking for the nearest interactive ancestor (button, link, menu item, tab, combobox, etc.) and applies the existing role+name / text / testId strategies to *that* element. Click targets that are themselves interactive are never promoted past — `<input>` still hardens against `<input>`, not its surrounding `<form>`. 8 new tests in `packages/chrome-extension/tests/selectors.test.ts` cover the promotion paths and the negative cases (already-interactive, no-ancestor, depth-exceeded, `<a>` without href).

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/library/auth-profile.ts` | **New.** AuthProfile schema + matchProfile + resolveProfileHeaders. |
| `packages/core/src/library/url-glob.ts` | **New.** Pure glob matcher. |
| `packages/core/tests/library/url-glob.test.ts` | **New.** 8 tests. |
| `packages/core/tests/library/auth-profile.test.ts` | **New.** 10 tests. |
| `packages/core/tests/render/e2e/renderer.test.ts` | +5 tests for auth emission. Factory adds `runAs: null, auth: null`. |
| `packages/core/src/render/e2e/renderer.ts` | Emit `setExtraHTTPHeaders` + add `context` to fixture destructure when `recording.auth` is present. |
| `packages/core/src/types/analysis.ts` | Add optional `auth` field to `WorkflowRecordingSchema`. |
| `packages/core/src/browser.ts` | Re-export auth helpers + schemas. |
| `packages/chrome-extension/src/settings/index.html` | **New.** Settings entrypoint. |
| `packages/chrome-extension/src/settings/main.tsx` | **New.** React root. |
| `packages/chrome-extension/src/settings/SettingsPage.tsx` | **New.** Profile CRUD UI. |
| `packages/chrome-extension/src/settings/settings.css` | **New.** Page styles. |
| `packages/chrome-extension/src/shared/profiles.ts` | **New.** chrome.storage.local accessors. |
| `packages/chrome-extension/src/popup/App.tsx` | Match profile on record-start; thread matchedProfile through naming/recording state; bake `recording.auth` at stop time; Settings button. Footer v1.3.0. |
| `packages/chrome-extension/src/popup/NamingForm.tsx` | Accept matchedProfile; render auth hint. |
| `packages/chrome-extension/src/popup/popup.css` | Styles for the auth hint + Settings button. |
| `packages/chrome-extension/vite.config.ts` | Add `settings` rollup input. |
| `packages/chrome-extension/manifest.config.ts` | Add settings to web_accessible_resources. |
| `docs/08-test-library.md` | v1.3 section rewritten — extension-Settings, glob URL patterns, `${runAs}` substitution, domain-aware profile matching. |
| `packages/chrome-extension/src/content-script/selectors.ts` | Interactive-ancestor promotion: `findInteractiveTarget` walks up to 5 levels for the nearest interactive (button/link/menuitem/etc.) ancestor before hardening, so clicks on decorative descendants get a stable role+name selector instead of positional CSS. |
| `packages/chrome-extension/tests/selectors.test.ts` | +8 tests for promotion and the negative cases. |
