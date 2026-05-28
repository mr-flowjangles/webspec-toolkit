# 10 — Team Shareability + Queue Model (v1.4 design)

## Why this exists

End-of-day on 2026-05-15, Rob surfaced an overall goal that none of the existing docs named:

> "If I create the unit test cases, everyone needs to be able to run them."

That looked at first like a small shareability fix (move files from Downloads to a git repo). The next design session (2026-05-16) walked deeper and revealed something bigger: **webspec is on its way to being a workflow engine**. Recordings aren't disposable scripts; they're building blocks. Test runs aren't one-shots; they're compositions. The shareability requirement is real, but it's the *visible* part of a deeper shape shift in the product.

This doc supersedes the v1.4 "Suites" milestone in `docs/08-test-library.md`. Suites as a concept don't go away — they're a subset of what queues do.

## What changed from the first draft of this doc

The original `docs/10` proposed switching auth from save-time resolution (literal user code baked into the spec) to run-time substitution (`process.env.UID`), under the theory that each teammate needs to run as themselves. **That analysis was wrong.**

Rob clarified: the user codes (e.g. `TTIDUMWSUP`) are **shared role credentials**, not personal identity. Case analysts share a code. Supervisors share a different code. CMS users share another. Anyone running a test *wants* to authenticate as the role the test was recorded against. So:

- **Save-time bake stays.** The renderer can keep emitting `await context.setExtraHTTPHeaders({ uid: 'TTIDUMWSUP' })` as a literal.
- **No `process.env.UID` substitution needed** for v1.4. If a future scenario needs per-runner identity (rare), the `${env.NAME}` syntax already reserved in v1.3's design doc can be activated then.

The PHI question (`99-open-questions.md`) also resolves cleanly: Bellese intends to seed and test against **synthetic data**, so `recording.json` is commit-safe.

## The new mental model: Test Cases and Queues

Two new first-class concepts. Both are named exactly the way Rob talks about them.

### Test Case

An **atomic recording** — one continuous browser session capturing one named action. Examples:

- `create-lead`
- `fill-lead-details`
- `cancel-lead`
- `approve-lead`
- `create-opt`
- `fill-opt`

A Test Case is what the Chrome extension records today (it's `recording.json` + the rendered `.spec.ts`). The shift is that a Test Case is no longer treated as a finished test — it's a **module**, intended for composition.

For v1.4 MVP, Test Cases are **not yet reusable across queues** — if Queue A and Queue B both need `create-lead`, the Test Case is recorded once but its body gets duplicated into both queue specs. Reuse comes in v1.5+ when Test Cases become importable helpers.

### Queue

An **ordered composition of Test Cases** that runs as one unit. A Queue has:

| Property | Description |
|---|---|
| `id` / name | What the queue is called. Becomes the spec filename. |
| `steps` | Ordered list of Test Case refs. |
| `roleByStep` | Per-step auth role (which role/header-set runs that step). |
| `inputs` | Optional starting state. E.g. `record_id` for queues that don't start from zero. |
| `iterations` | Number of times to run the whole queue. Default 1. Set to 100 to seed 100 records. |

Examples Rob walked through:

```
Queue 1: full lead flow
  steps: [create-lead, fill-details, create-opt, fill-opt, approve]
  roles: [analyst, analyst, analyst, analyst, supervisor]
  iterations: 1

Queue 2: create + cancel
  steps: [create-lead, cancel-lead]
  roles: [analyst, analyst]
  iterations: 1

Queue 3: supervisor opens existing record
  steps: [open-lead, approve-lead]
  roles: [supervisor, supervisor]
  inputs: { record_id: <passed in> }
  iterations: 1

Queue 4: bulk seed
  steps: [create-lead, fill-details, create-opt, fill-opt]
  roles: [analyst, analyst, analyst, analyst]
  iterations: 100
```

### How a Queue renders to Playwright

One queue → one `.spec.ts` file. `test.describe.serial` keeps a single browser context across steps (so state flows forward); a `for` loop wraps the describe for iterations > 1; role switches emit a fresh `setExtraHTTPHeaders` call at the step boundary.

```ts
// queue-1-full-lead.spec.ts
test.describe.serial('Queue 1 — full lead flow', () => {
  let leadId: string;

  test('1. Create lead (analyst)', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ uid: 'CASE_ANALYST_CODE' });
    // ... inlined create-lead body
    leadId = /* extracted from URL */;
  });

  test('2. Fill details (analyst)', async ({ page }) => {
    // ... inlined fill-details body, uses leadId
  });

  // steps 3, 4 same shape...

  test('5. Approve (supervisor)', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ uid: 'SUPERVISOR_CODE' });
    // ... inlined approve body
  });
});
```

For `iterations: 100`, the renderer emits a `for` loop wrapping the `describe.serial` (each iteration = fresh chain, fresh record).

## What ships to git

A team-shared per-app test repo. One repo per Bellese app (e.g. `ucm-tests`, not a monorepo across apps).

```
ucm-tests/
├── package.json                       # @playwright/test + minimal deps
├── pnpm-lock.yaml                     # reproducible install
├── playwright.config.ts               # standard Playwright config, testDir = 'tests'
├── .gitignore                         # node_modules, test-results, playwright-report
├── README.md                          # how to install + run (auto-generated)
├── test-cases/                        # the atomic recordings (source of truth)
│   ├── create-lead/
│   │   ├── recording.json
│   │   └── recording.spec.ts          # standalone-runnable version (optional)
│   ├── fill-lead-details/
│   ├── cancel-lead/
│   └── ...
└── tests/                             # the composed queues (what Playwright runs)
    ├── queue-1-full-lead.spec.ts
    ├── queue-2-create-cancel.spec.ts
    ├── queue-3-supervisor-approve.spec.ts
    └── queue-4-seed-100.spec.ts
```

A teammate clones, runs `pnpm install`, runs `pnpm exec playwright test` (or opens Playwright UI). Done. **They do not need the Chrome extension.** The extension is purely the authoring surface.

## v1.4 MVP scope

Smallest thing that makes the queue model real and ships team-runnable tests:

1. **Compose Queue action in the extension.** Some UI surface (TBD: new tab, or extension of Settings) where you:
   - See the list of recorded Test Cases.
   - Create a Queue: name it, drag Test Cases into order, set role per step, set iterations, optionally declare inputs.
   - Save the Queue.
2. **Renderer takes a Queue manifest and emits one `.spec.ts`** with the structure shown above (inlined Test Case bodies, no reuse yet).
3. **Configurable repo path.** A "Test repo folder" setting (per Chrome profile) — Save writes to `<repo>/test-cases/` and `<repo>/tests/` instead of Downloads. Falls back to Downloads if unset.
4. **Bootstrap files.** When writing to an empty repo, webspec scaffolds `package.json`, `playwright.config.ts`, `.gitignore`, `README.md` once.

That's the v1.4 milestone.

## Build-session decisions (2026-05-17)

Design session with Rob pinned down the open questions from the first draft. Five of six resolved; the remaining one (slug collisions) stays deferred per the original note.

### 1. Where Queue composition lives

**A sibling section in the existing Settings page**, alongside "Auth Profiles". Adds a top-level nav switcher inside `packages/chrome-extension/src/settings/`. Faster to ship than a brand-new full-page surface and matches the pattern Rob already knows. New stand-alone HTML entries (a dedicated `queues/index.html`) and a detached `chrome.windows` popup were considered and rejected — neither earns the extra surface area at MVP.

Open follow-up (parked, not blocking): "Settings" as the page name starts to feel off once it hosts authored content (Queues) and not just config (Auth Profiles). Revisit when a third sibling appears.

### 2. Repo path configuration UX

**One global "Test repo folder" setting** per Chrome profile. Single field in Settings → General. Folder picker via the File System Access API (one-time permission grant). Falls back to `~/Downloads/webspec/` if unset. The per-app-by-URL-pattern model (mirroring auth profiles' shape) was considered and rejected — adds plumbing for a multi-app case that isn't real yet.

### 3. Storage / sync mechanism

**GitHub is the sync layer.** The team repo IS the source of truth. No AWS service, no local SQLite. Considered and rejected:

- **AWS** (DynamoDB + S3 for queues / test cases) — adds login, sync conflict resolution, infra cost. Fights the v1.4 thesis that the team repo IS the global state. Reconsider in v1.5+ only if a real cross-team need (run-result dashboards, central history) emerges.
- **Local WASM SQLite** (in IndexedDB) — technically doable via `sql.js` or the official SQLite-WASM build with persistence to IndexedDB or OPFS. Real SQL inside the extension. But: a queue authored in your extension's IndexedDB isn't visible to a teammate's extension; the repo has to hold the manifest regardless. Adds an authoring-side DB with no shareability story.

### 4. Queue artifact on disk

**Two files per Queue in `<repo>/tests/`**: `queue-N-{slug}.json` (the authored manifest, source of truth) + `queue-N-{slug}.spec.ts` (the rendered Playwright output, regenerable from the manifest). Both committed. The `.json` is the editable artifact; the `.spec.ts` is what Playwright actually runs and what teammates / CI consume without needing the extension.

Considered and rejected:

- **Spec only with the manifest in `chrome.storage.local`** — kills shareability. Author B clones the repo, opens their extension, sees specs but cannot edit queues.
- **Single file with the manifest as a `// @webspec-queue { ... }` header comment** — fewer files, but couples authoring to a parsing convention. Not worth the file-count savings; separate JSON is easier to review in PRs.

### 5. Step role naming

**Each step stores a raw `runAs` value** (the literal user code like `TTIDUMWSUP`). No new "Roles" registry. Step schema:

```json
{ "testCase": "create-lead", "runAs": "TTIDUMWSUP" }
```

The Queue composer pre-fills `runAs` from the Test Case's recorded `runAs` when a step is added; the user can override per step. At render time the step boundary emits `await context.setExtraHTTPHeaders({ ...resolvedHeaders })` using the step's `runAs` substituted through the matching auth profile.

A named-role registry (`analyst → TTIDUMWSUP`, `supervisor → SUPVCODE01` in a new Settings tab) was considered and rejected: cleaner spec output, but adds a new entity and a Settings UI for ~3 codes per app. Revisit if a single team grows past handful-of-roles ergonomics.

### 6. Existing `~/Downloads/webspec/` library

**Leave it alone.** With a configured Test repo folder, new saves write to the repo. With no repo configured, saves continue to `~/Downloads/webspec/` as today. No migration tool — if a user wants their pre-v1.4 recordings in the repo, they copy them by hand.

### Still deferred

- **Slug collisions for Test Cases.** What happens when two authors both save `create-lead`? Deferred until multi-author is a real scenario. v1.4 ships single-author; the collision is theoretical.

## What v1.4 deliberately does NOT do

- **Reusable Test Cases across queues.** If Queue A and Queue B both use `create-lead`, the body is duplicated in both spec files. Painful at 8+ queues; ship anyway and let the duplication signal earn the v1.5 redesign.
- **Cross-recording inputs/outputs.** No wiring `leadId` produced by one Test Case into a different Queue's first step. For v1.4, inputs are flat values declared at the Queue level (e.g. a `record_id` constant the queue uses).
- **AI-generated variations.** Banked for v1.5+.
- **Test Case editing.** Re-record to update; no in-place editor.
- **Queue-level assertions** beyond what each Test Case already asserts.

## v1.5.0 — Reusable Test Cases (design locked, 2026-05-20)

Closes v1.4's acknowledged duplication: Queue specs stop inlining Test Case bodies and start importing them. Single source of truth per Test Case.

**File layout** under `<repo>/test-cases/<slug>/`:

```
recording.json          # raw WorkflowRecording (source of truth, unchanged)
recording.ts            # NEW — exports `async function run({ page, context })` (helper module, the body)
recording.spec.ts       # CHANGED — thin wrapper that imports `run`, applies recorded auth, calls it inside one test()
playwright.config.ts    # per-test config (unchanged, makes the spec standalone-runnable)
```

The recording stays standalone-runnable (`recording.spec.ts` still passes against `npx playwright test`). The helper is the single source of truth — Queues consume it via import.

**Helper signature.** `export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void>`. Named export (more discoverable in editors than default). Body: `await page.goto(recording.startUrl)` + each `RecordedEvent` re-emitted via the existing `renderEvent` helper. Does NOT touch headers — auth is the caller's concern (the standalone spec sets them from `recording.auth`; Queue specs set them per step's resolved profile).

**Queue renderer change.** Step bodies emit:

```ts
import { run as createLead } from '../test-cases/create-lead/recording.js';
// ...
test('Step 1 — create-lead (as ANALYST01)', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ uid: 'ANALYST01' });
  await createLead({ page, context });
});
```

Iterations wrap the helper call, not the inlined events:

```ts
for (let i = 0; i < 100; i++) {
  await createLead({ page, context });
}
```

Imports are deduped at the top of the Queue spec — one `import` per unique Test Case slug, regardless of how many steps reference it. The local alias is a slug-derived camelCase identifier (e.g. `create-lead` → `createLead`).

**Path resolution.** Queue specs live at `<repo>/tests/queue-N-{slug}.spec.ts`; Test Case helpers live at `<repo>/test-cases/{slug}/recording.ts`. The import path is always `../test-cases/{slug}/recording.js` (NodeNext / ESM extension — Playwright's TS loader resolves `.js` → `.ts` source).

**Tradeoff acknowledged.** Imports add coupling: rename a Test Case slug in `chrome.storage.local` and existing Queue specs break until re-rendered. Mitigated by Queues re-rendering only at user Save (no implicit auto-regenerate; user always sees current truth before commit). Renaming is already explicitly post-MVP — Test Case "editing" is re-record only.

**Migration / self-heal.** Existing Test Cases saved before v1.5.0 have `recording.spec.ts` (the old inlined shape) but no `recording.ts`. The Queue Save flow self-heals: before rendering, it scans the Queue's referenced slugs and writes `recording.ts` from `recording.json` for any missing helper. No standalone migration tool — saves and Queue renders fix the layout automatically. The popup's own Test Case save (post-v1.5.0) writes both `recording.ts` and the new `recording.spec.ts` shape.

**Out of scope for v1.5.0.** No input/output wiring between Test Cases — the helper signature is fixed at `{ page, context }`. That's v1.5.1+. No slug rename UI; no Test Case in-place editor. No AI variation amplification — separate milestone.

## v1.5.1 — CI Surface (design locked, 2026-05-20)

Closes the team-shareability loop: a teammate clones the repo, GitHub Actions runs the Test Cases + Queues on every push and PR, webspec is not in the loop. The repo runs itself.

**Approach.** Add a fifth scaffold file to the v1.4.2 bootstrap set: `.github/workflows/playwright.yml`. Same `BOOTSTRAP_*` template constant pattern, same `ensureBootstrap` confirmed-write flow, same self-heal-on-first-save semantics. The confirm prompt copy gains a fifth bullet so users see the workflow before agreeing to write.

**Workflow shape.**

```yaml
name: Playwright tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch: {}

jobs:
  test:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

Triggers: `push` + `pull_request` to `main` and `workflow_dispatch` (manual reruns). Chromium-only — Firefox + WebKit add ~10 min and aren't part of v1's golden-path mission. The Playwright HTML report uploads as a job artifact regardless of pass/fail so a failed run is debuggable from the Actions tab.

**README update.** `BOOTSTRAP_README` gets a `## CI` section: brief description of when the workflow runs, link to the Actions tab once it exists, and the secrets caveat (see below).

**Secrets out of scope for v1.5.1.** Recorded auth headers live in `recording.json` (committed) and in `setExtraHTTPHeaders` calls inside the rendered specs (committed). For CI against a public site or a sandbox where the baked headers are safe to commit, this Just Works. For CI against an environment where those headers contain real credentials, the user needs to (a) replace baked values with `${{ secrets.UID }}` style references in the workflow or specs by hand, or (b) wait for a v1.6+ "secrets-aware rewriter" that's a real design problem because it has to know which auth-profile header values to template out vs leave alone. v1.5.1 ships the workflow as-is; the README's CI section calls the secrets gap out so users with credential-bearing recordings know to look at it before pushing to a public repo.

**Re-scaffold semantics.** `needsBootstrap` still keys off `package.json` — the workflow file is part of the v1.5.1 bootstrap set, not a separate signal. A repo bootstrapped pre-v1.5.1 (has `package.json` but no `.github/workflows/playwright.yml`) won't get the workflow auto-added; the user needs to delete `package.json`, re-trigger a save to re-bootstrap, OR copy the workflow from a freshly bootstrapped repo. We considered making the workflow a separate "needs CI bootstrap" check but rejected it as premature — pre-v1.5.1 users are a single-author edge case and a doc note is enough.

**Out of scope for v1.5.1.** No secret rewriting. No matrix builds (browser × Node version). No incremental "run only changed Queues" — Playwright's own sharding/changed-files handling is a v1.7+ optimization. No Bellese-internal GitHub Enterprise variant (this is for `github.com` per the toolkit's standing rules).

## v1.6 — Input/Output Wiring (design locked, 2026-05-28)

The third v1.5+ futures item, promoted to its own minor. Test Cases become **parametric**: they declare named inputs (replacing specific recorded values) and named outputs (extracted from the final page state). Queue steps wire each input either to a constant or to an earlier step's output. This unlocks Queue 3 — `[open-lead, approve-lead]` driven by an `record_id` produced by a prior step — and the broader "compose real workflows from atomic actions" mission.

### Mental model

A Test Case stops being a frozen replay. It becomes a function:

```
createLead({ page, context }, { leadName }) → { leadId, leadName }
```

- **Inputs** are recorded fill values that the user has promoted to named parameters at Save time. The helper's `inputs.<name>` is substituted for the recorded literal at render time.
- **Outputs** are values the user has declared at Save time, extracted from page state after the last recorded action runs. Two source kinds in v1.6 MVP: a URL regex (`/\/leads\/(\d+)/` → first capture group) and the text content of a selector (`h1.lead-title` → `.textContent()`).

A Queue is now a wiring graph: each step's inputs are either constants or references to earlier non-iterated steps' outputs.

### Test Case schema changes

`packages/core/src/types/test-case.ts` (the stored shape) gains two optional arrays:

```ts
type TestCase = {
  slug: string;
  name: string;
  description: string;
  runAs: string | null;
  recording: WorkflowRecording;
  savedAt: string;
  // v1.6 additions:
  inputs?: TestCaseInput[];
  outputs?: TestCaseOutput[];
};

type TestCaseInput = {
  name: string;          // e.g. "leadName"
  eventIndex: number;    // index into recording.events[] — the fill whose value is parameterized
};

type TestCaseOutput = {
  name: string;          // e.g. "leadId"
  source:
    | { kind: 'url'; pattern: string }      // RegExp string with at least one capture group; output = match[1]
    | { kind: 'text'; selector: string };   // page.locator(selector).first().textContent()
};
```

Both fields are optional and default to empty. Existing v1.5.x Test Cases (no `inputs` / `outputs`) keep working unchanged — backward compatible additive change.

**Substitution rule.** Full-value only in v1.6. If a recorded fill is `"Acme Corp Inc"` and the user promotes it to `leadName`, the entire string is replaced by `inputs.leadName` at render time. Substring parameterization (e.g. `"Acme ${suffix} Inc"`) is post-MVP.

**Constraints.** `eventIndex` must point at a `fill` or `input`-typed `RecordedEvent`. The Save UI enforces this — only fill-class events appear in the "promote to input" picker.

### Save UI changes

The popup's Test Case Save panel gains two sections under the existing name/description/runAs fields:

```
Outputs (optional)
──────────────────
 + leadId    from URL   /leads/(\d+)
 + leadName  from text  h1.lead-title
[+ add output]

Inputs (optional)
──────────────────
Recorded fills detected:
  [ ] event #3   fill h1.name        "Acme Corp"
  [✓] event #7   fill input[name=…]  "ops@acme.test"   → emailAddress
  [ ] event #12  fill textarea       "notes…"
```

- **Outputs** are an ordered list of `{ name, source }`. Source kind is a dropdown (`URL regex` | `text selector`); the second field is the pattern or selector. Name uniqueness validated client-side.
- **Inputs** is built from the recording's fill/input events. Each row has a checkbox + an input name field. Checking the row promotes the event's value to that named input; the field becomes required and validated for uniqueness.

Both panels are collapsed by default — Test Cases without I/O are still the common shape and shouldn't have noisy empty forms.

### Queue step schema changes

`QueueStep` (stored in the Queue manifest) gains one optional field:

```ts
type QueueStep = {
  testCaseSlug: string;
  runAs: string | null;
  iterations: number;
  // v1.6 addition:
  inputValues?: Record<string, QueueStepInputValue>;
};

type QueueStepInputValue =
  | { mode: 'constant'; value: string }
  | { mode: 'output'; step: number; outputName: string };  // 1-based step index, must reference an earlier step with iterations === 1
```

Default: empty. A step with no `inputValues` and a Test Case with no declared inputs is unchanged from v1.5.x.

**Validation at Queue Save time** (composer-side, not renderer):
- Every declared input on the referenced Test Case must have a wired `inputValues[name]` entry (constant or output). No "default to the recorded literal" fallback — explicit is the rule we set with the output design.
- `mode: 'output'` references must target an earlier step (`step < currentStep`), the target step must have `iterations === 1`, and the target Test Case must declare that output name. Iterated steps are hidden from the dropdown (per the locked decision).

### Composer UI changes

The Queue composer's step panel grows an **Inputs** subsection — visible only when the referenced Test Case declares inputs:

```
Step 2 — update-lead
runAs: editor
iterations: 1
Inputs:
  leadName   ▼ from step 1 (createLead) → leadName
  email      ▼ constant: "ops@acme.test"
```

The dropdown for each input lists:
- `constant: …` — a text field appears for the literal value.
- `from step <N> (<slug>) → <outputName>` — one entry per earlier non-iterated step's declared outputs. Disabled rows (with an explanatory tooltip) for iterated earlier steps.

### Helper signature & rendered output

The Test Case helper module (`test-cases/<slug>/recording.ts`) signature changes from:

```ts
export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void> { … }
```

to:

```ts
export async function run(
  { page, context }: { page: Page; context: BrowserContext },
  inputs: { leadName: string } = { leadName: '' }
): Promise<{ leadId: string; leadName: string }> {
  // … recorded events, with inputs.leadName substituted at the promoted event …
  await page.locator('h1.name').fill(inputs.leadName);
  // … remaining events …

  // Output extraction (appended after the last recorded action):
  const _urlMatch_leadId = page.url().match(/\/leads\/(\d+)/);
  const leadId = _urlMatch_leadId?.[1] ?? '';
  const leadName = (await page.locator('h1.lead-title').first().textContent())?.trim() ?? '';
  return { leadId, leadName };
}
```

- Inputs param is positional, defaulted to an object containing empty-string defaults for every declared input. Means the helper can still be called bare (`run({ page, context })`) and won't crash — useful for ad-hoc one-off invocations and for the standalone `recording.spec.ts` wrapper.
- Return type narrows to the declared output set. No declared outputs → `Promise<void>` and no return statement (back to today's shape).
- Extraction code is appended **after** the last recorded action. URL extraction reads `page.url()` synchronously. Text extraction awaits `.first().textContent()` with `.trim()` and a fallback `?? ''` so a missing element returns the empty string rather than throwing — matches the "fail at the assertion, not at the helper" philosophy from M6.

Queue spec call sites change from today's:

```ts
await createLead({ page, context });
await updateLead({ page, context });
```

to (when wiring is present):

```ts
const createLead_1 = await createLead({ page, context }, { leadName: 'Acme Corp' });
const updateLead_2 = await updateLead({ page, context }, { leadName: createLead_1.leadName });
```

When a step has no declared inputs **and** isn't an output source for any later step, the call stays bare — no `const` assignment, no inputs object — to avoid unused-var noise in the rendered output. The renderer scans forward to decide whether each step's return value is referenced before deciding whether to assign.

### Standalone Test Case spec (the `recording.spec.ts` wrapper)

The thin wrapper that imports `run` and calls it gains a sensible default-inputs path:

```ts
import { test } from '@playwright/test';
import { run } from './recording.js';

test('create-lead', async ({ page, context }) => {
  await run({ page, context });  // default empty-string inputs; recording's own literal still appears in the action via the recorded event when the input is unset? — see below
});
```

**Open implementation detail** that the build will settle: the spec wrapper calls `run` with no inputs, which means the param defaults kick in (empty strings). If the user wants the standalone spec to use *the recorded literal values*, the renderer needs to emit them as the defaults instead of empty strings:

```ts
inputs: { leadName: string } = { leadName: 'Acme Corp' }
```

This preserves the v1.5.x "standalone spec replays the recording faithfully" property. Going with **recorded-literal defaults** as the lock — empty-string defaults would silently change standalone behavior, which is a regression. Confirmed.

### Renderer changes

Three renderer pieces touch:

1. `renderTestCaseModule` — emits the new signature, performs input substitution at the right event index, appends extraction code.
2. `renderQueueSpec` — decides per-step whether to assign the return value (forward-scans for references), emits the inputs object with constants or `<alias>.<output>` references, and renders the alias `<slug>_<index>` consistently.
3. The shared snippet that writes the `recording.spec.ts` wrapper continues to call `run({ page, context })` bare — defaulted-input behavior preserves replay-of-recording semantics.

No changes to `playwright.config.ts`, the README bootstrap, or the CI workflow — all v1.4/v1.5 surfaces stay as-is.

### Iteration semantics

Locked at design time:

- A step with `iterations > 1` **cannot supply outputs** to later steps. The composer hides it from the output-source dropdown; the validator rejects manual references.
- A step with `iterations > 1` **can still consume inputs** (constants or outputs from earlier non-iterated steps). The same input value is passed each iteration in v1.6 — no per-iteration variation yet (that's part of AI variation amplification, the next milestone).
- Renderer: the `for` loop wraps the helper call as today; if the iterated step happens to have declared outputs, they're computed each pass but discarded — no `const` assignment, no aliasing.

### Backward compatibility & self-heal

The v1.5.0 self-heal pattern extends:

- Existing Test Cases without `inputs`/`outputs` keep rendering exactly as before — the new fields are optional, the renderer treats `undefined` as `[]`.
- A Queue saved pre-v1.6 has no `inputValues` on any step. Re-saving the Queue post-v1.6 detects this; if the referenced Test Cases still have no declared inputs, the spec re-renders unchanged. If a referenced Test Case has *gained* declared inputs since the Queue was last saved, the composer surfaces an "Inputs need wiring" affordance on that step before Save can complete.
- Removing an input or output from a Test Case is the user's responsibility. The next Queue Save will surface a missing-output error (composer-side validation) or, if missed, a TypeScript compile error at `npm test` time. v1.7+ may add a proactive cross-reference checker.

### Out of scope for v1.6

- **Per-iteration input variation.** A step with `iterations: 3` sees the same `{ leadName: 'Acme' }` each pass. Variation is a v1.7+ AI-amplification milestone (item #4 in v1.5+ futures).
- **Substring substitution.** Input substitution is whole-value-only.
- **Output kinds beyond URL regex + text selector.** No attribute extraction (`getAttribute`), no response-body parsing, no localStorage reads. Add when a real fixture demands it.
- **Outputs from iterated steps as arrays.** Iterated steps don't produce wirable outputs at all in v1.6.
- **Step reordering re-renders dependent queues.** Aliases are positional (`<slug>_<index>`); reorder is a re-render, surfaced when the user re-saves.

### Patch plan within v1.6

- **v1.6.0** — Design (this section). Doc-only.
- **v1.6.1** — `TestCase` + `QueueStep` schema additions (zod + storage). No UI yet.
- **v1.6.2** — Save-UI Inputs/Outputs panels in the popup.
- **v1.6.3** — Composer Inputs subsection + dropdown + validation.
- **v1.6.4** — Renderer changes (`renderTestCaseModule` + `renderQueueSpec`).
- **v1.6.5** — Integration tests (parametric helper + wired queue + extraction round-trip against the `form.html` fixture).

Order chosen so each patch is independently shippable and the surface grows outward: contract → write surface → read surface → render → integration.

## v1.5+ futures

In rough priority order (final order earned by lived experience with v1.4 + v1.5):

1. **Reusable Test Cases.** ✅ Design locked above — shipped in v1.5.0.
2. **CI surface.** ✅ Design locked above — shipped in v1.5.1.
3. **Input/output wiring.** ✅ Design locked above — implementation begins in v1.6.1. Test Cases declare their outputs (`createLead → { leadId }`) and inputs. The Queue composer wires them. Enables Queue 3-style "start at step 5 with a record passed from step 4."
4. **AI variation amplification.** Same `LLMProvider` / `BedrockAdapter` seam used today for negative-scenario generation, extended to positive variations: "Here's `create-lead`. Generate 10 variants exercising every dropdown / radio / required-field combination." One Test Case → ten Queues.
5. **Secrets-aware workflow rewriter** (was banked from v1.5.1). Auth-profile headers whose values look like credentials get templated to `${{ secrets.NAME }}` references in the rendered workflow / specs, with the user prompted to add the corresponding secret in GitHub. Probably surfaces in the Settings → Auth Profiles editor as a "treat as secret" toggle per header.

## Implementation-detail questions for the build session

Smaller items that don't change the design shape but need answers when code starts:

- **Iterations input placement** — where on the composer the `iterations` field lives (queue-level header? footer near Save?). Defer to first composer mockup.
- **Re-render behavior on Test Case edit** — when a recorded Test Case changes, do queues using it auto-regenerate their `.spec.ts`, or stay stale until the user opens the queue and saves? Lean lazy; user is in control.
- **Bootstrap files in an empty repo** — what gets scaffolded on first save (`package.json`, `playwright.config.ts`, `.gitignore`, `README.md`), and whether the user gets a confirmation prompt before webspec writes them.

## Position relative to other docs

- **`docs/08-test-library.md`** — the v1.4 "Suites" section is superseded by this doc. v1.2 (on-disk library) and v1.3 (auth profiles) still authoritative.
- **`docs/09-test-planning-surface.md`** — Flavor B (notes on existing recordings) overlaps with the Queue composer UI; some of that polish may fall out naturally. Flavor A (plan-before-record) and Flavor C (compose from prose) remain parked; revisit after v1.4.
- **`docs/99-open-questions.md`** — PHI question resolves (synthetic data); env-var auth substitution stays deferred.

## Status

**Design locked, implementation queued (2026-05-17).** Big-shape decisions (composer location, repo path, sync mechanism, queue artifact, step role naming, existing library) are pinned in the "Build-session decisions" section above. Implementation-detail questions remain and will be settled during the build. The v1.4 milestone in `docs/07-build-plan.md` should be updated to point here and renamed from "Suites" to "Queues + Team Shareability."
