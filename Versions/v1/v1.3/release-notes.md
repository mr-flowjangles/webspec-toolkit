# v1.3

## v1.3.3 — Test Repo Folder Setting (2026-05-17)

### Problem

Per the v1.3.1 design decision, every save-to-repo flow (Test Cases, Queue manifests, Queue specs) needs a configured target folder. The Settings page got its tab scaffold in v1.3.2, but no surface yet exists for picking that folder or persisting it across sessions. Without this setting, the v1.4 build can't move past authoring.

### Solution

A new **General** tab in the Settings page hosts the global "Test repo folder" field — webspec's first File System Access API integration.

How it works:

1. User clicks **Choose folder…** → `window.showDirectoryPicker({ mode: 'readwrite' })` opens the native folder dialog.
2. On selection, the `FileSystemDirectoryHandle` is persisted to IndexedDB (object store `repoFolder`, key `current`) because handles cannot be serialized to `chrome.storage.local`. A small `RepoFolderInfo` shape (`{ name, setAt }`) is mirrored to `chrome.storage.local` under `webspec.repoFolder` for cheap reads from anywhere in the extension that only needs the display name.
3. The panel queries `handle.queryPermission({ mode: 'readwrite' })` on load and surfaces the status as a colored chip (✓ granted / ! permission needed / × denied). When Chrome demotes a previously-granted handle to `prompt` after a restart, a **Re-grant access** button calls `requestPermission` to restore it.
4. **Change…** re-opens the picker; the × button clears both IndexedDB and `chrome.storage.local` (with a confirm prompt explaining the fallback to `~/Downloads/webspec/`).

No save-time integration in this patch — the setting is purely surfaced and persisted. Hooking Test Case + Queue saves through the configured handle lands in subsequent patches.

**First-run copy guidance:** Chrome blocks `Desktop`, `Downloads`, and `Documents` from `showDirectoryPicker` for security. The empty state explicitly calls this out, points the user at a concrete location (`~/code/ucm-tests`), and gives them the `mkdir` command to run if they don't have a folder yet. Surfaced after first-use feedback showed the default macOS user folders are all blocklisted and the silent rejection was confusing.

The File System Access API types aren't yet in TypeScript's `lib.dom.d.ts`, so a minimal `src/global.d.ts` adds ambient declarations for `Window.showDirectoryPicker`, `FileSystemHandle.queryPermission`, and `FileSystemHandle.requestPermission` rather than pulling in `@types/wicg-file-system-access`.

### New

- `packages/chrome-extension/src/shared/repoFolder.ts` — IndexedDB + `chrome.storage.local` accessors for the repo-folder handle and metadata.
- `packages/chrome-extension/src/settings/GeneralPanel.tsx` — General Settings tab with the Test repo folder field.
- `packages/chrome-extension/src/global.d.ts` — ambient File System Access API types.
- `.general-*` styles in `settings.css` (field card, folder name pill, permission chip, action buttons).

### Changed

- `packages/chrome-extension/src/settings/SettingsPage.tsx` — `SettingsTab` extended to `'auth' | 'queues' | 'general'`; **General** added as the third tab.

### Fixed

- N/A (additive patch.)

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/repoFolder.ts` | **New** — storage module. |
| `packages/chrome-extension/src/settings/GeneralPanel.tsx` | **New** — panel UI. |
| `packages/chrome-extension/src/global.d.ts` | **New** — FS Access ambient types. |
| `packages/chrome-extension/src/settings/SettingsPage.tsx` | Added third tab + panel route. |
| `packages/chrome-extension/src/settings/settings.css` | Added `.general-*` styles. |
| `Versions/v1/v1.3/release-notes.md` | This entry. |

## v1.3.2 — Settings Queues Tab Scaffold (2026-05-17)

### Problem

`docs/10` (v1.3.1) locked in that the Queue composer lives as a sibling section in the existing Settings page, but the Settings page was still a single-purpose Auth Profiles surface. Before any real Queue UI can land, the page needs a tab shell so subsequent v1.4 patches have a place to mount their components.

### Solution

Refactored `SettingsPage` into a tab shell that hosts two sibling panels:

- **`AuthProfilesPanel`** — extracted verbatim from the old `SettingsPage` (same state, same logic, same persistence). Tagline moved inside the panel since it's auth-specific.
- **`QueuesPanel`** — placeholder panel introducing the Queue concept with a "Coming in v1.4" callout pointing at `docs/10-team-shareability.md`.

The shell owns only the active-tab state. Tabs use ARIA `tablist` / `tab` / `tabpanel` roles with keyboard focus styling.

No behavior change for Auth Profiles — the same component renders, just routed through the shell.

### New

- `packages/chrome-extension/src/settings/AuthProfilesPanel.tsx` — auth profiles UI, extracted from the old `SettingsPage`.
- `packages/chrome-extension/src/settings/QueuesPanel.tsx` — placeholder for the v1.4 Queue composer.
- `.settings-tabs` / `.settings-tab` / `.settings-tab-active` / `.settings-panel` styles in `settings.css`.

### Changed

- `packages/chrome-extension/src/settings/SettingsPage.tsx` — now a tab shell. Renders the `<h1>` + tab nav, then mounts the active panel inside an ARIA `tabpanel`.
- `settings-head` gains a bottom border the active tab visually overlaps.
- H1 changed from "webspec — Auth Profiles" to "webspec" (the tab handles the section name).

### Fixed

- N/A (scaffold; no behavior change.)

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/settings/SettingsPage.tsx` | Rewritten as a tab shell. |
| `packages/chrome-extension/src/settings/AuthProfilesPanel.tsx` | **New** — auth profiles UI, extracted. |
| `packages/chrome-extension/src/settings/QueuesPanel.tsx` | **New** — placeholder. |
| `packages/chrome-extension/src/settings/settings.css` | Added tab styles; updated `.settings-head` and `.settings-tagline`. |
| `Versions/v1/v1.3/release-notes.md` | This entry. |

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
