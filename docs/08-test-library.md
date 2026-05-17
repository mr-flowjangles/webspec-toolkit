# 08 — Test Library (v1.2+)

How recorded tests get a home, where the files land, and how a user iterates on them. This doc is authoritative for the v1.2 / v1.3 / v1.4 milestones — the slice of the product that turns webspec from "record-once, file-on-disk-with-a-timestamp, run-from-terminal-with-arguments" into a workflow where the extension authors the test and Playwright UI is the surface to see and run them.

## Why this exists

v1.0–v1.1 shipped the recording → spec hand-off end-to-end. The friction surfaced immediately on first real use:

- After **Download**, two files land at the top of `~/Downloads/` with timestamp-stamped names. Finding them again requires hunting through Downloads.
- Running a spec from `~/Downloads/` doesn't work via the bundled `make run-spec` (the Playwright config restricts `testDir` to `tests/fixtures/recordings/`) — and a vanilla `npx playwright test ~/Downloads/foo.spec.ts` fails because `@playwright/test` isn't installed in `~/Downloads`.
- Each recording is a one-shot artifact. There's no concept of a *suite* of tests, no "this test runs as user X," no organized place where all your recorded tests live.

The v1 mission ("shift-left + fail-fast on a live page") is achieved structurally but the user-facing workflow has too many sharp edges. The library closes those edges.

## Division of labor: extension vs Playwright UI

The big design choice — and the one that keeps the scope tractable — is:

- **Extension authors the test.** Name, description, run-as user, recorded events. Save writes the file pair to disk.
- **Playwright UI is the library + execution surface.** `playwright test --ui` against the saved tests gives you the list, the run buttons, the traces, the watch mode, the time-travel debugger. It's already polished and we don't need to build it.

We do **not** build an in-extension list of "your tests." Playwright UI does that better than anything we'd ship, and a Chrome-extension-only list would diverge from the on-disk reality the moment the user moves a file.

## Scope (v1.2 vs v1.3 vs v1.4)

This doc covers three milestones. They land in order because each builds on the previous:

| Milestone | Scope |
|---|---|
| **v1.2 — Test Library** | Per-test folder layout on disk. Naming form gains a `runAs` field. Save writes a per-test `playwright.config.ts` and ensures a parent config exists so `playwright test --ui` discovers everything. New `make run-tests` shortcut. |
| **v1.3 — Auth Injection** | The `runAs` field becomes functional. New `webspec.config.ts` defines the auth mechanism (defaults to header injection, ModHeader-equivalent). Renderer emits the auth step before the recorded flow. |
| **v1.4 — Suites** | A new entry kind — a suite is an ordered list of recording slugs that render to a single `.spec.ts` with N `test()` blocks. Enables Test 1 = "create record" + Test 2 = "update record" chained in one file. |

---

## v1.2 — Test Library

### Files on disk are canonical

No `chrome.storage.local`. The library *is* the directory:

```
~/Downloads/webspec/
  playwright.config.ts            ← created on first save; discovers all subdirs
  <slug-1>/
    recording.spec.ts
    recording.json
  <slug-2>/
    recording.spec.ts
    recording.json
  ...
```

Why files-only:

- **Single source of truth.** No sync drift between extension storage and disk.
- **Sharable.** A team member can hand you `~/Downloads/webspec/login-flow/` and you drop it into your own and Playwright UI picks it up.
- **The Playwright UI already lists them.** Duplicating that list in the extension is busywork.

### Slug derivation

`<slug>` is derived from the recording name:

- Lowercase
- Non-alphanumeric → `-`
- Collapse consecutive `-`
- Trim leading/trailing `-`
- Max length 64 chars

| Name | Slug |
|---|---|
| `Adding Items to the todo list` | `adding-items-to-the-todo-list` |
| `Create Lead — UCM NexGen` | `create-lead-ucm-nexgen` |
| `it's a test` | `it-s-a-test` |

**Collision handling:** the extension checks if `~/Downloads/webspec/<slug>/` already exists (best-effort — Chrome extensions can't directly read filesystem, so the check is via attempting a `chrome.downloads.search` lookup). If a collision is detected, the Save panel prompts: *"A test named 'X' already exists. Overwrite or rename?"* Rename appends `-2`, `-3`, etc.

### Naming form gains `runAs`

The pre-start form gets a third field:

```
Test case name:    [_______________]  (required)
Description:       [_______________]  (required)
Run as user:       [_______________]  (optional in v1.2; consumed in v1.3)
```

`runAs` is **optional** for v1.2. It's captured into `WorkflowRecording.runAs` but the renderer doesn't emit anything from it yet — that's v1.3. We collect it now so v1.3 doesn't require re-recording.

If the project has no `webspec.config.ts` (v1.3 concept), or the field is left blank, the rendered spec runs as whatever Playwright would run as by default.

### Per-test `playwright.config.ts`

Save writes a tiny config alongside the spec:

```ts
// ~/Downloads/webspec/<slug>/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  reporter: 'line',
  use: { headless: true },
});
```

This makes the per-test folder runnable in isolation if the user wants to.

### Parent `playwright.config.ts`

Save also ensures a parent config exists at `~/Downloads/webspec/playwright.config.ts`. Written on the first save; left alone on subsequent saves:

```ts
// ~/Downloads/webspec/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '**/recording.spec.ts',
  reporter: 'line',
  use: { headless: true },
});
```

This is what `playwright test --ui` reads to discover every test in the library.

### Make shortcut

```sh
make run-tests
```

Resolves to:

```sh
pnpm --filter @webspec/cli exec playwright test --ui \
  --config ~/Downloads/webspec/playwright.config.ts
```

That single command opens the Playwright UI window with every saved test listed, the run buttons, traces, watch mode, the works. **This is the library UI.**

For headless one-shot runs:

```sh
make run-tests-ci         # no --ui, just runs everything once
make run-test SLUG=login  # runs a single test by slug
```

### Surface — popup, after Stop

The review panel's actions become:

- **Save** (primary) — writes the file pair + per-test config + ensures parent config exists. Closes the popup with a "Saved as `~/Downloads/webspec/<slug>/`" status. Tells the user to run `make run-tests` to see + execute.
- **Discard** — same as today.

The old "Download" / "Export" terminology goes away. There's only one Save, and it always lands in the canonical location.

### Contract change — `WorkflowRecording.runAs`

`WorkflowRecording` gains a new optional field:

```ts
runAs: z.string().nullable().default(null),
```

Optional so existing recordings (the v1.1.x fixtures and any captures users made before upgrading) continue to validate. v1.2 captures it in the naming form; v1.3 makes it functional.

### Open questions for v1.2

1. **Slug collision check.** Chrome extensions can't directly read the filesystem. `chrome.downloads.search({ query: ['webspec/<slug>/'] })` gives us a list of past downloads we initiated, but it doesn't reflect files the user manually moved or deleted. Probably acceptable to be best-effort: warn when our records show a collision, otherwise let the new save overwrite. Open: do we always overwrite silently, or always confirm?
2. **Parent `playwright.config.ts` write-once.** If the user customizes the parent config and then we re-write it on a later save, we clobber their changes. Probably: check existence, never overwrite. Document in a header comment that the file is webspec-owned-but-not-managed.
3. **`make run-tests` from an arbitrary cwd.** The Makefile is in the repo root, but the user might not be in the repo when they want to run tests. Maybe ship a standalone `webspec-run` shell script that doesn't need the Makefile, installable via `pnpm link` or similar.

---

## v1.3 — Domain-Aware Auth Profiles

### The model

Most Bellese / federal apps in scope use a **header-injection** dev backdoor (ModHeader-style). The browser sends `uid: TTIDUMWSUP` (or whatever the app expects) on every request, the app reads that header, and the user is "authenticated" without ever hitting the login UI.

In Playwright the equivalent is `context.setExtraHTTPHeaders({ ... })`, called once at the start of the test. The rendered spec gets that call when the recording's URL matches a configured auth profile.

**Configuration lives in the extension, not in a repo.** v1.2 first-use showed the workflow is browser-centric — there isn't always a "Bellese repo" the user is driving from. Requiring `webspec.config.ts` somewhere on disk meant going to a terminal to add auth, which defeats the point. The v1.3 shape: profiles live in `chrome.storage.local`, edited via a new Settings page in the extension, matched against the active tab's URL at recording-start time.

### Profile shape

```ts
interface AuthProfile {
  id: string;              // generated uuid
  name: string;            // display label, e.g. "UCM Dev"
  urlPattern: string;      // glob, e.g. "http://app.ucm-dev.cmscloud.local/*"
  headers: Array<{ name: string; value: string }>;
}
```

Stored as `AuthProfile[]` under a single `chrome.storage.local` key. Header values support `${runAs}` substitution — the recording's `runAs` field is interpolated at save time.

Example for UCM:

```
Name:    UCM Dev
URL:     http://app.ucm-dev.cmscloud.local/*
Headers:
  uid    ${runAs}
```

### URL pattern matching

Glob style — `*` matches zero or more characters of any kind. Simple, predictable, no regex anxiety. Implementation: convert the pattern to a regex internally (`*` → `.*`, escape everything else), test against the active tab's URL.

If multiple profiles match the same URL, pick the longest pattern (most specific wins). If none match, the recording is captured without auth — the spec runs anonymously, which is fine for public sites and a clear failure mode for authenticated ones.

### Lifecycle

1. **Setup (once).** User opens Settings (new tab from the popup), adds a profile.
2. **Record-start.** Popup queries the active tab's URL, looks up profiles in `chrome.storage.local`, finds the best match. The matched profile name is displayed in the naming form ("Auth: UCM Dev") — or "No auth profile matches" if nothing matched.
3. **Save.** The matched profile's headers are resolved (substituting `${runAs}` with the recording's `runAs` field) and baked into the `WorkflowRecording.auth` field.
4. **Render.** When `recording.auth` is present, the renderer emits `await context.setExtraHTTPHeaders({ ... })` between the `test(` opener and `page.goto`.

### Contract change — `WorkflowRecording.auth`

```ts
auth: z.object({
  profileName: z.string(),                 // for human reference in the JSON
  headers: z.record(z.string(), z.string()),  // resolved, ready to emit
}).nullable().default(null),
```

Resolved at save time, baked into the recording. The spec is self-contained — running it doesn't require the original profile to still exist. If the user changes the profile later, they re-record or re-render via the CLI.

### What the renderer emits

For a recording with `auth: { profileName: 'UCM Dev', headers: { uid: 'TTIDUMWSUP' } }`:

```ts
import { expect, test } from '@playwright/test';

test('Create Lead', async ({ page, context }) => {
  // Creating a Lead
  await context.setExtraHTTPHeaders({
    'uid': 'TTIDUMWSUP',
  });
  await page.goto('http://app.ucm-dev.cmscloud.local/...');
  // ... recorded flow
});
```

If `recording.auth === null`, the auth block is omitted entirely. Same code path as v1.2 recordings without a matched profile.

### Settings page UI

Opens from a new "Settings" button on the popup's idle screen. Same pattern as the audit-report and library tabs: `chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/index.html') })`.

Layout:

```
┌─────────────────────────────────────────────────────────┐
│ webspec / Settings — Auth Profiles      [+ Add profile] │
├─────────────────────────────────────────────────────────┤
│ UCM Dev                                      [Edit] [×] │
│   http://app.ucm-dev.cmscloud.local/*                   │
│   uid → ${runAs}                                        │
├─────────────────────────────────────────────────────────┤
│ UCM Test                                     [Edit] [×] │
│   http://app.ucm-test.cmscloud.local/*                  │
│   uid → ${runAs}                                        │
└─────────────────────────────────────────────────────────┘
```

Add/Edit opens an inline form: name input + URL pattern input + N header rows (add row, remove row). Delete prompts for confirmation.

### Modes deferred

v1.3 ships **headers only**. The original design admitted `cookie`, `url`, and `storageState` modes — those are deferred until real Bellese apps demand them. The contract reserves the seam (profile gains an `mode` field eventually, defaulting to `'headers'`) but v1.3.0 hardcodes header injection.

### Secrets

`${env.NAME}` substitution for secret values lands when an actual Bellese app needs it. UCM uses a raw user code, not a secret. The contract reserves the syntax (any `${env.X}` in a header value would emit `process.env.X` rather than the literal) but v1.3.0 doesn't implement it.

### Open questions for v1.3

1. **No-match warning vs. silent.** When the user starts recording on a URL that doesn't match any profile, do we (a) show a non-blocking warning in the naming form, (b) block until they pick a profile or "No auth", or (c) silently proceed unauthenticated? Leaning (a). Public sites and pre-prod environments are real cases where no auth is correct.
2. **Profile editing during a recording.** What if the user opens Settings and edits the matched profile mid-recording? The captured `recording.auth` was resolved at start-time; subsequent edits don't retroactively change a recording. Document this; not a bug.
3. **Per-recording header override.** Does a recording sometimes need a header beyond what the profile gives? (E.g., one test wants `X-Feature-Flag: true`.) Probably extend the naming form with an "Additional headers" section in v1.5. v1.3 keeps it profile-driven.
4. **First-class ModHeader import.** Read a ModHeader profile JSON export to bootstrap a webspec profile. Nice-to-have for onboarding, deferred.

---

## v1.4 — Suites

### The model

A new artifact kind that lives in `~/Downloads/webspec/<suite-slug>/suite.json`:

```ts
interface Suite {
  name: string;
  description: string;
  runAs: string | null;        // suite-level default; individual tests override
  testSlugs: string[];         // ordered list of test slugs from ~/Downloads/webspec/
}
```

The renderer turns a `Suite` into one `.spec.ts` with N `test()` blocks (one per `testSlugs[i]`), wrapped in `test.describe.serial(...)` so they execute in order and Playwright honors the order. The rendered file lives at `~/Downloads/webspec/<suite-slug>/suite.spec.ts`.

Playwright UI picks up `suite.spec.ts` the same way it picks up `recording.spec.ts` files — both are tests to run, just at different granularities.

### UI

Suite creation is **not** in the Chrome extension. It's a CLI / Makefile action:

```sh
make new-suite NAME="Lead lifecycle" TESTS=create-lead,update-lead,close-lead
```

Or interactively (`make new-suite-interactive`). This keeps the extension a recorder and puts suite composition in the existing test-management territory (the same territory Playwright UI occupies).

### What the renderer emits

```ts
import { expect, test } from '@playwright/test';

test.describe.serial('Lead lifecycle', () => {
  // Suite description as a leading comment

  test('Create Lead — UCM NexGen', async ({ page, context }) => { ... });
  test('Update Lead', async ({ page, context }) => { ... });
  test('Close Lead', async ({ page, context }) => { ... });
});
```

### Open questions for v1.4

1. **State passing between tests.** Test 1 creates record ID `CSE-2026-00042`. Test 2 needs to know that ID. Options: (a) Playwright fixture / shared variable; (b) read the URL the browser ended on after Test 1; (c) defer entirely — every test in a suite is independent, the user is on their own for state. Leaning (c) for v1.4 with (a) as v1.5.
2. **Auth override at test level.** If the suite is `runAs: 'admin'` but one test inside is `runAs: 'reviewer'`, the per-test `setExtraHTTPHeaders` overrides the suite default. Confirm this is the right precedence.
3. **Suites of suites?** No — keeps the model flat.

---

## Reading order

Implementation order matches the milestone order: ship the on-disk library + Playwright UI launcher first, then make `runAs` functional, then add suites. Each milestone is independently shippable and useful on its own; v1.2 is genuinely useful even without v1.3/v1.4.
