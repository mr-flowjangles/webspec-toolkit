# Manual test plan — v1.4 + v1.5

A step-by-step verification of everything that shipped between v1.3.4 and v1.5.1. Walk this when you want to confirm the extension still works end-to-end. Tick the checkboxes as you go.

Run order matters — later steps reuse the folder, recordings, and Queue from earlier ones.

---

## 0. Prereqs

- [ ] Pull latest `main` and rebuild:
  ```sh
  git checkout main && git pull
  pnpm install
  pnpm -C packages/chrome-extension build
  ```
- [ ] Open `chrome://extensions` → enable Developer mode → **Load unpacked** → point at `packages/chrome-extension/dist/`. If the extension is already loaded, click the **reload** icon on it.
- [ ] Have a terminal open in a directory where you can do `mkdir ~/code/webspec-test-repo` (do NOT create the folder yet — step 2 needs an empty parent).
- [ ] Have a clean GitHub account / org ready to push a brand-new private repo to (for step 8).

---

## 1. Settings → General → Test repo folder picker (v1.3.3 baseline)

- [ ] Click the webspec extension icon → click the ⚙ settings button (opens `chrome-extension://…/src/settings/index.html`).
- [ ] Click the **General** tab. The "Test repo folder" field reads "No folder configured."
- [ ] In your terminal: `mkdir -p ~/code/webspec-test-repo`.
- [ ] Back in Settings → General, click **Choose folder…** → pick `~/code/webspec-test-repo`.
- [ ] Expect: folder name appears with a green "✓ Access granted" chip.

**If broken:** Chrome may have blocked `~/code/`. Try a different parent path (e.g. `~/Projects/webspec-test-repo`). Chrome blocks `Desktop`, `Downloads`, `Documents` — those won't work.

---

## 2. Queues tab empty states (v1.4.0)

- [ ] Click the **Queues** tab.
- [ ] Expect: "No saved Test Cases under `webspec-test-repo/test-cases/`. Record one from the extension popup first — then come back to compose a Queue."
- [ ] (Don't try **+ New Queue** yet — it's disabled until at least one Test Case exists.)

---

## 3. Record a Test Case — first save (v1.5.0 + v1.4.2 bootstrap)

- [ ] Open a new tab to a simple public site — e.g. `https://example.com`.
- [ ] Click the webspec icon → **Record workflow**.
- [ ] Fill the naming form: **Name** = `Example Hello`; **Description** = `Lands on example.com and clicks the More information link`; leave **runAs** blank.
- [ ] Click **Start**. The recorder is now armed.
- [ ] In the page, click the **"More information…"** link. Wait for the navigation to finish.
- [ ] Click the extension icon again → **Stop**.
- [ ] On the review panel, click **Save**.
- [ ] **Expect a confirm dialog** listing FIVE files: `package.json, playwright.config.ts, .gitignore, README.md, and .github/workflows/playwright.yml`. Click **OK**.
- [ ] Saved state appears: "Saved to `webspec-test-repo/test-cases/example-hello/`."

**Check the disk:**

```sh
ls ~/code/webspec-test-repo
# Expect: .github  .gitignore  README.md  package.json  playwright.config.ts  test-cases

ls ~/code/webspec-test-repo/test-cases/example-hello
# Expect: playwright.config.ts  recording.json  recording.spec.ts  recording.ts

ls ~/code/webspec-test-repo/.github/workflows
# Expect: playwright.yml
```

- [ ] All five bootstrap files present at the root, including the workflow.
- [ ] All four Test Case files present in `test-cases/example-hello/` — note that **both** `recording.ts` AND `recording.spec.ts` exist (this is the v1.5.0 helper-module shape).

**Sanity-check the file contents:**

- [ ] `cat ~/code/webspec-test-repo/test-cases/example-hello/recording.ts` — should start with `import type { BrowserContext, Page } from '@playwright/test';` and contain `export async function run({ page, context }: ...) { ... }`.
- [ ] `cat ~/code/webspec-test-repo/test-cases/example-hello/recording.spec.ts` — should contain `import { run } from './recording.js';` and `await run({ page, context });` (not inlined events).

---

## 4. Standalone Test Case runs (v1.5.0)

- [ ] In the repo: `cd ~/code/webspec-test-repo && npm install` (downloads `@playwright/test`).
- [ ] `npx playwright install --with-deps chromium`
- [ ] `npm test`
- [ ] Expect: 1 passing test — the `Example Hello` test from `test-cases/example-hello/recording.spec.ts`.

---

## 5. Compose + save a Queue (v1.4.0 + v1.4.1 + v1.5.0)

- [ ] Back in the extension Settings → **Queues** tab.
- [ ] Expect: the empty-state copy now changes to show **+ New Queue** is enabled. The "Repo: webspec-test-repo" status line should appear.
- [ ] Click **+ New Queue**.
- [ ] Fill: **Queue name** = `Smoke Suite`.
- [ ] Step 1 should default to `example-hello` as the Test Case. Leave `runAs` blank. Leave iterations blank.
- [ ] (Optional) Click **+ Add step** → pick `example-hello` again → set iterations to `3`.
- [ ] Click **Save Queue**.
- [ ] Expect: status badge flashes "Saved." and the Queue appears in the list as `#1 Smoke Suite` with `tests/queue-1-smoke-suite.json` as its on-disk path.

**Check the disk:**

```sh
ls ~/code/webspec-test-repo/tests
# Expect: queue-1-smoke-suite.json  queue-1-smoke-suite.spec.ts

cat ~/code/webspec-test-repo/tests/queue-1-smoke-suite.spec.ts
```

- [ ] The spec contains `import { run as exampleHello } from '../test-cases/example-hello/recording.js';` at the top.
- [ ] Step bodies contain `await exampleHello({ page, context });` (NOT inlined `page.goto` / `page.click` etc.).
- [ ] If you added the iteration-3 step, that test() block wraps the call in `for (let i = 0; i < 3; i++) { await exampleHello({ page, context }); }`.

**Run the Queue spec:**

- [ ] `npm test`
- [ ] Expect: both `test-cases/example-hello/recording.spec.ts` AND `tests/queue-1-smoke-suite.spec.ts` pass. (Total: 1 standalone test + N Queue steps.)

---

## 6. Decline-bootstrap path (v1.4.2 fallback)

This verifies the user can decline the scaffold prompt and the primary save still happens.

- [ ] In the terminal: `mkdir -p ~/code/webspec-test-repo-2`.
- [ ] In Settings → General, click **Change…** → pick `~/code/webspec-test-repo-2`.
- [ ] Record any quick recording (e.g. example.com again, name `Decline Test`). Save.
- [ ] **Expect the bootstrap prompt.** Click **Cancel**.
- [ ] Recording should still save: `test-cases/decline-test/` exists with all four Test Case files.
- [ ] No bootstrap files at the repo root (`ls ~/code/webspec-test-repo-2` shows only `test-cases/`).
- [ ] (Optional — revert by deleting `~/code/webspec-test-repo-2` after.)

Switch back to the original folder: Settings → General → **Change…** → `~/code/webspec-test-repo`.

---

## 7. Self-heal for pre-v1.5.0 Test Cases (v1.5.0)

Simulates a Test Case saved before v1.5.0 — `recording.json` exists but `recording.ts` does not.

- [ ] `rm ~/code/webspec-test-repo/test-cases/example-hello/recording.ts`
- [ ] In the extension → Settings → Queues → click **Edit** on `#1 Smoke Suite` → just hit **Save Queue** again (no changes).
- [ ] After save, run: `ls ~/code/webspec-test-repo/test-cases/example-hello`
- [ ] Expect: `recording.ts` is back. The Queue's `.spec.ts` was just re-rendered, and the self-heal regenerated the helper from `recording.json` along the way.
- [ ] Sanity-check `recording.ts` again — same `export async function run` shape as step 3.

---

## 8. CI surface — Actions workflow end-to-end (v1.5.1)

This is the big one. We push the repo to GitHub and watch CI run.

- [ ] `cd ~/code/webspec-test-repo`
- [ ] `git init && git add . && git commit -m "Initial webspec scaffold"`
- [ ] Create a new **private** repo on github.com (no README, no .gitignore — webspec already wrote those):
  ```sh
  gh repo create webspec-test-repo --private --source=. --remote=origin
  git push -u origin main
  ```
- [ ] Open the repo on github.com → **Actions** tab.
- [ ] Expect: **Playwright tests** workflow appears, started by the push, status = in progress or queued.
- [ ] Wait for completion. Expect: **green check**.
- [ ] Open the run → scroll to **Artifacts** at the bottom → expect a `playwright-report` artifact (~few MB).
- [ ] Download and unzip the artifact. Open `index.html`. Expect: HTML report listing all the tests with timing + traces.

**If CI fails:**

- Check the run logs. Common culprits:
  - `npx playwright install` failing on a dependency — usually a Chromium / Linux ABI mismatch.
  - The site you recorded against isn't reachable from GitHub Actions (e.g. internal-only URLs). For this test plan we used `example.com`, which is fine.
  - Selector flakiness — re-record the Test Case in a cleaner state if it's a real flake, not a CI problem.

- [ ] (Optional cleanup — delete the test GitHub repo when done.)

---

## Done

If every box above is ticked, v1.4 + v1.5 is verified end-to-end. The bottom-of-the-stack contract — record → compose → push → CI green — is solid.

If anything failed, capture the step number + what you saw in the next session-resume so we can fix forward.

**Cleanup** (optional):

```sh
rm -rf ~/code/webspec-test-repo ~/code/webspec-test-repo-2
```

Reset the configured folder in Settings → General → × button if you want webspec to fall back to `~/Downloads/webspec/` for future ad-hoc recordings.
