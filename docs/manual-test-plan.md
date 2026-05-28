# Manual test plan — v1.4 + v1.5 + v1.6

A step-by-step verification of everything that shipped between v1.3.4 and v1.6.5. Walk this when you want to confirm the extension still works end-to-end. Tick the checkboxes as you go.

Run order matters — later steps reuse the folder, recordings, and Queue from earlier ones. The v1.6 sections (9–13) layer on top of v1.4 + v1.5 (0–8); you can run them either after section 8 or in isolation against the same `~/code/webspec-test-repo` after a rebuild.

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

---

# v1.6 — Input/Output wiring (added 2026-05-28)

Five extra sections layered on top of the v1.4 + v1.5 pass above. They verify the **Save panel Inputs/Outputs authoring** (v1.6.2), **composer Inputs subsection** with constant + output-reference wiring (v1.6.3), the **renderer changes** to the helper module + queue spec (v1.6.4), and the **end-to-end wiring** Chromium has already exercised in `render-v1-6-wiring.integration.test.ts` (v1.6.5).

These sections use the same `~/code/webspec-test-repo` from section 1 above. Run them after section 8, OR in isolation after rebuilding the extension. The fixture is `tests/fixtures/playwright-target/lead-form.html` (already in this webspec source tree, written in v1.6.5).

## 9. Prereqs for v1.6 — serve the fixture page

The lead-form fixture has a name input, a Create button, a `location.hash`-based URL update, and an echoed-name result heading — purpose-built to exercise both v1.6 output kinds (URL regex + text selector) and to confirm input substitution actually reached the field.

Chrome extensions can't drive `file://` URLs out of the box, so we serve the fixture over `http://localhost:8765` for the recorder.

- [ ] In the webspec source tree:
  ```sh
  cd tests/fixtures/playwright-target
  python3 -m http.server 8765
  # leave this running for sections 10–12
  ```
- [ ] Open `http://localhost:8765/lead-form.html` in a new Chrome tab. Confirm the page renders: heading "Lead form", a "Lead Name" text input, a "Create" button.
- [ ] Sanity-check the page once by hand (don't record yet): type a name, click Create. The lead-detail section reveals with the typed name as `#lead-title` and the URL gains a `#/lead/1` hash. Reload the page to reset state.

**If broken:** Python's http.server isn't available — use any other static server pointed at that directory. The path is `/lead-form.html`; the test plan assumes port `8765` but any port works.

## 10. Record a Test Case with declared Inputs + Outputs (v1.6.2)

This is the core v1.6 authoring flow. The Save panel grows two collapsible sections under the existing name/description/runAs fields.

- [ ] Reload the `lead-form.html` page so the in-page counter resets to 1.
- [ ] Click the webspec icon → **Record workflow**.
- [ ] Fill the naming form: **Name** = `Create Lead`; **Description** = `Types a lead name and creates a lead on the v1.6 fixture page`; leave **runAs** blank. Click **Start**.
- [ ] In the page: click the Lead Name input, type `Acme Corp`, click Create. Wait for the lead-detail section to appear (URL should change to `…/lead-form.html#/lead/1`).
- [ ] Click the extension icon → **Stop**.
- [ ] Expect the Recording summary panel. Below the URL trail + warning paragraph, two new collapsible sections appear: **Inputs** and **Outputs**, both collapsed (count `(0)`).

**Expand Inputs and promote the typed name:**

- [ ] Click the **Inputs (0)** chevron to expand. Expect: one or more rows, each one showing an `#<index>`, a kind tag (`INPUT` or `CHANGE`), the truncated selector in monospace, and the recorded value in italic quotes.
- [ ] Find the row whose recorded value is `"Acme Corp"`. Check its checkbox.
- [ ] Expect: a name field appears under the row, indented. Type `leadName` into it.
- [ ] (Optional) If you see other `INPUT` / `CHANGE` rows for events you don't recognize (e.g. a stray `change` from the page's own JS), leave them unchecked.

**Expand Outputs and declare both source kinds:**

- [ ] Click the **Outputs (0)** chevron to expand. Expect: "No outputs declared." text + an `+ add output` button.
- [ ] Click **+ add output**. A row appears with an empty name field, a dropdown defaulting to "from URL", an empty pattern field, and an `×` remove button.
- [ ] Name: `leadId`. Leave the kind as `from URL`. Pattern: `#/lead/(\d+)` (literal — the parens are a capture group).
- [ ] Click **+ add output** again. Name: `leadName`. Change the kind dropdown to `from text`. Expect: the placeholder in the third field changes from a regex example to `h1.title`. Selector: `#lead-title`.

**Save panel gating:**

- [ ] The **Save** button should be enabled. Hover it — no tooltip.
- [ ] Test the gate: clear the name field on the `leadId` output row. Expect: a red error appears under the row ("Output name is required."), and the Save button becomes **disabled**. Hover Save — tooltip shows "Fix 1 validation error before saving."
- [ ] Restore the name to `leadId`. Save button re-enables.

**Save and verify on disk:**

- [ ] Click **Save**. Expect: the green "Saved" success state.
- [ ] In your terminal: `cat ~/code/webspec-test-repo/test-cases/create-lead/recording.json | python3 -m json.tool`
- [ ] Expect: the JSON has `"inputs": [{ "name": "leadName", "eventIndex": N }]` and `"outputs": [{ "name": "leadId", "source": { "kind": "url", "pattern": "#/lead/(\\d+)" }}, { "name": "leadName", "source": { "kind": "text", "selector": "#lead-title" }}]`.
- [ ] `cat ~/code/webspec-test-repo/test-cases/create-lead/recording.ts | head -25`
- [ ] Expect: the helper signature reads `export async function run(\n  { page, context }: { page: Page; context: BrowserContext },\n  inputs: { leadName: string } = { leadName: 'Acme Corp' },\n): Promise<{ leadId: string; leadName: string }> {`.
- [ ] Further down in the file: the fill event substitutes — `await page.<selector>.fill(inputs.leadName);` (NOT `fill('Acme Corp')`).
- [ ] At the bottom of the function: extraction code + return:
  ```ts
  const _out_leadId = page.url().match(/#\/lead\/(\d+)/)?.[1] ?? '';
  const _out_leadName = ((await page.locator('#lead-title').first().textContent()) ?? '').trim();
  return { leadId: _out_leadId, leadName: _out_leadName };
  ```

**Run the standalone spec to confirm replay still works with defaults:**

- [ ] `cd ~/code/webspec-test-repo && npm test -- test-cases/create-lead/recording.spec.ts`
- [ ] Expect: 1 passed. The wrapper calls `run({ page, context })` without inputs, so the recorded-literal default `'Acme Corp'` is used. Page workflow runs end-to-end against your localhost:8765 fixture.

**If broken:**
- "Inputs (0)" section doesn't appear → `IOAuthoringPanel` didn't mount. Check the browser console for React errors.
- Checkbox doesn't reveal the name field → the v1.6.2 state callback isn't firing. Inspect the popup with Chrome DevTools (right-click in popup → Inspect).
- `recording.json` lacks `inputs`/`outputs` → `attachIOToRecording` not called. Confirm `App.tsx` is on v1.6.2 by running `git log --oneline packages/chrome-extension/src/popup/App.tsx | head`.
- `recording.ts` has the old `Promise<void>` signature → the helper-module renderer wasn't rebuilt. `pnpm -C packages/chrome-extension build` and reload the unpacked extension.

## 11. Compose a Queue with constant input wiring (v1.6.3)

- [ ] In the extension → ⚙ → **Queues** tab.
- [ ] Click **+ New Queue**. Name: `Lead Flow`.
- [ ] In step 1's Test Case dropdown: select **Create Lead (create-lead)**.
- [ ] Expect: directly under the step's row, an indented **Inputs:** subsection appears with a single row for `leadName` — a name label (code-styled), a mode dropdown defaulting to `constant`, and a value field.
- [ ] In the value field: type `Beta Industries`.
- [ ] Save Queue.

**Verify the rendered spec:**

- [ ] `cat ~/code/webspec-test-repo/tests/queue-1-lead-flow.spec.ts`
- [ ] Expect the call site reads: `await createLead({ page, context }, { leadName: 'Beta Industries' });` (constant baked into the spec).
- [ ] Since step 1's return value is **not referenced** by any later step (this Queue only has one step), there's NO `let createLead_1!:` declaration at the top of the describe body, and NO `createLead_1 = await ...` assignment. Just the bare `await createLead(...)`.

**Run the queue spec:**

- [ ] `npm test -- tests/queue-1-lead-flow.spec.ts`
- [ ] Expect: 1 passed. The page receives `Beta Industries` instead of `Acme Corp` because the input substitution reached the fill action.

## 12. Wire a second step to step 1's output (v1.6.3 + v1.6.4 capture)

This is the headline v1.6 demo — Queue 3 in the design doc.

We need a second Test Case that accepts an input — but on the same fixture page, since we want one self-contained test plan. Record one more.

- [ ] Reload `lead-form.html` so the page resets.
- [ ] Record again. **Name** = `View Lead Echo`; **Description** = `Second step that pretends to use a lead name passed in from step 1`; runAs blank.
- [ ] In the page: type `placeholder`, click Create. Stop.
- [ ] In the Save panel → expand **Inputs** → check the row whose value is `"placeholder"` → name it `incomingName`. **Outputs:** leave empty.
- [ ] Save.

**Now compose a two-step Queue:**

- [ ] Settings → Queues → **Edit** the `Lead Flow` queue from section 11.
- [ ] Click **+ Add step**. The new step row appears with the first Test Case alphabetically pre-selected.
- [ ] In step 2's Test Case dropdown: select **View Lead Echo (view-lead-echo)**.
- [ ] Expect: step 2's **Inputs:** subsection appears with one row for `incomingName`.
- [ ] In the `incomingName` row's mode dropdown: change from `constant` to `from earlier step`. Expect: the value field is replaced by a second dropdown listing earlier step outputs.
- [ ] The dropdown should contain options like: `step 1 (create-lead) → leadId` and `step 1 (create-lead) → leadName`. Pick **`step 1 (create-lead) → leadName`**.
- [ ] Save Queue.

**Verify the rendered spec:**

- [ ] `cat ~/code/webspec-test-repo/tests/queue-1-lead-flow.spec.ts`
- [ ] At the top of the `describe.serial` body: `let createLead_1!: Awaited<ReturnType<typeof createLead>>;` (hoisted declaration — the v1.6.5 fix that made step 2 able to see step 1's return value).
- [ ] In step 1's body: `createLead_1 = await createLead({ page, context }, { leadName: 'Beta Industries' });` (no `const`; assignment into the hoisted let).
- [ ] In step 2's body: `await viewLeadEcho({ page, context }, { incomingName: createLead_1.leadName });` (output reference reads through the captured return value).

**Run it:**

- [ ] `npm test -- tests/queue-1-lead-flow.spec.ts`
- [ ] Expect: 2 passed (Step 1 — create-lead; Step 2 — view-lead-echo). Step 2 received `Beta Industries` from step 1's text-extraction output and typed it into the same field on the second page load.

## 13. Validation paths (v1.6.2 + v1.6.3)

Quick sweep of the validation rules so a future regression in either form gets caught.

**Save panel (popup):**

- [ ] Record any fresh recording (e.g. the fixture again). Open the Save panel.
- [ ] Add two outputs both named `leadId`. Expect: red "Duplicate output name 'leadId'." under the second row; Save disabled.
- [ ] Change the second to `leadId2`. Expect: error clears; Save re-enables.
- [ ] Change `leadId2` to `1leadId` (starts with a digit). Expect: red "Output name must be a valid identifier (letters, digits, _, \$; cannot start with a digit)." Save disabled.
- [ ] Add a `from URL` output with an empty pattern. Expect: red "URL pattern is required." Save disabled.
- [ ] (Cleanup — fix or remove the invalid entries; discard the recording when done.)

**Composer (Settings → Queues):**

- [ ] Edit the `Lead Flow` queue.
- [ ] On step 1, set **iterations** to `3`.
- [ ] On step 2's `incomingName` input, the `from earlier step` dropdown should now **NOT** list step 1 — because iterated steps can't supply outputs per the v1.6 design lock.
- [ ] Set step 2's `incomingName` mode back to `constant`. Save. (Should succeed.)
- [ ] Reset step 1 iterations back to blank/1 so the queue keeps the section-12 shape if you re-run.

**If broken:**
- Duplicate-name error doesn't appear → `validateIOAuthoring` filter logic broke. Compare current code against `packages/chrome-extension/src/popup/io-authoring.ts`.
- Iterated step still appears in the wiring dropdown → `availableOutputSources` filter logic broke. Compare against `packages/chrome-extension/src/settings/queue-input-wiring.ts`.

---

## Done with v1.6

If every box above is ticked, v1.6 input/output wiring is verified end-to-end. The Save panel authoring → composer wiring → renderer output → live Playwright run chain is solid.

**Stop the http.server** when done:

```sh
# Ctrl-C the python3 -m http.server process from section 9.
```

**Cleanup** (optional):

```sh
rm -rf ~/code/webspec-test-repo/test-cases/create-lead ~/code/webspec-test-repo/test-cases/view-lead-echo
# Or delete the queue-1-lead-flow.* files if you want to keep the v1.5 example-hello Test Case.
```

If any v1.6 section failed, capture the section number + what you saw — that's the v1.6.7 patch input.
