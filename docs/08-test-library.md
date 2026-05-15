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

## v1.3 — Auth Injection

### The model

Most Bellese / federal apps in scope use a **header-injection** dev backdoor (ModHeader-style). The browser sends `X-User-Id: joe` (or whatever the app expects) on every request, the app reads that header, and the user is "authenticated" without ever hitting the login UI.

In Playwright the equivalent is `context.setExtraHTTPHeaders({ ... })`, called once at the start of the test. The rendered spec gets that call driven by `recording.runAs`.

### Project config — `webspec.config.ts`

Lives at the repo root (next to `package.json`). Optional — if absent, the renderer just emits the recorded flow with no auth setup, same as v1.2.

```ts
// webspec.config.ts
import { defineConfig } from '@webspec/core/config';

export default defineConfig({
  auth: {
    mode: 'headers',
    headers: {
      'X-User-Id': '${username}',
      'X-User-Role': 'tester',
    },
  },
});
```

Supported modes (extensible):

| `mode` | What the renderer emits | When to use |
|---|---|---|
| `headers` | `context.setExtraHTTPHeaders({ ... })` with `${username}` substituted | ModHeader-style dev backdoors. Default. |
| `cookie` | `context.addCookies([{ name, value, domain, ... }])` | Apps where session is identified by a cookie. |
| `url` | An initial `page.goto(template)` before the recorded flow | Apps with `/dev/login?user=X` impersonation endpoints. |
| `storageState` | `test.use({ storageState: '<path>' })` | Standard Playwright pattern; pre-baked auth state JSON. |

Multiple modes are NOT mixable in v1.3 — one auth mechanism per project. Composite auth comes later if real apps demand it.

### What the renderer emits

For `mode: 'headers'`, given `recording.runAs === 'joe'`:

```ts
import { expect, test } from '@playwright/test';

test('Create Lead — UCM NexGen', async ({ page, context }) => {
  // Create a new Medicare lead from the My Work tasks page...
  await context.setExtraHTTPHeaders({
    'X-User-Id': 'joe',
    'X-User-Role': 'tester',
  });
  await page.goto('http://app.ucm-dev.cmscloud.local/...');
  // ... recorded flow
});
```

If `recording.runAs === null` (recording didn't specify a user, OR project has no auth config), the auth block is omitted entirely.

### Where `webspec.config.ts` lives

Two reasonable homes:

- **In the user's repo** alongside source — versioned with the app code so each Bellese repo can pin its own auth shape. Best for the multi-app reality.
- **In `~/Downloads/webspec/`** alongside the test library — global to the user, simpler but doesn't model per-app differences.

Leaning the first. The extension's Save action looks for `webspec.config.*` walking up from the user's cwd / project; if not found, asks the user where to put one (or skips auth emission entirely).

### Secrets

Header values can interpolate environment variables via `${env.NAME}` — e.g., `'Authorization': 'Bearer ${env.DEV_BEARER_TOKEN}'`. The renderer emits `process.env.DEV_BEARER_TOKEN`; if the env var is missing at run time, Playwright fails with a clear message. Credentials never live in `recording.json`.

### Open questions for v1.3

1. **Per-recording header override.** Does a recording sometimes need a header beyond `runAs`? (E.g., one test needs `X-Feature-Flag: true`.) Probably extend `WorkflowRecording` with `authOverrides: Record<string, string> | null`, or punt to v1.5.
2. **Config discovery.** How does the *extension* know where `webspec.config.ts` is, given that the extension lives in the browser and the config lives in a repo on disk? Possibly: the extension doesn't — the *renderer* (running in the user's repo via the CLI when they re-render) is what reads the config. The extension's deterministic render gets no auth; the CLI's re-render does. Compromise that needs validation.
3. **First-class ModHeader import.** Read a ModHeader profile JSON export to bootstrap `webspec.config.ts`. Nice-to-have, deferred.

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
