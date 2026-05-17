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

## What v1.4 deliberately does NOT do

- **Reusable Test Cases across queues.** If Queue A and Queue B both use `create-lead`, the body is duplicated in both spec files. Painful at 8+ queues; ship anyway and let the duplication signal earn the v1.5 redesign.
- **Cross-recording inputs/outputs.** No wiring `leadId` produced by one Test Case into a different Queue's first step. For v1.4, inputs are flat values declared at the Queue level (e.g. a `record_id` constant the queue uses).
- **AI-generated variations.** Banked for v1.5+.
- **Test Case editing.** Re-record to update; no in-place editor.
- **Queue-level assertions** beyond what each Test Case already asserts.

## v1.5+ futures

In rough priority order (final order earned by Rob's lived experience with v1.4):

1. **Reusable Test Cases.** Each Test Case becomes an importable helper function: `import { createLead } from '../test-cases/create-lead'`. Queue specs become recipe files, not big inlined chunks. Edit `create-lead` once → every Queue using it gets the fix.
2. **Input/output wiring.** Test Cases declare their outputs (`createLead → { leadId }`) and inputs. The Queue composer wires them. Enables Queue 3-style "start at step 5 with a record passed from step 4."
3. **AI variation amplification.** Same `LLMProvider` / `BedrockAdapter` seam used today for negative-scenario generation, extended to positive variations: "Here's `create-lead`. Generate 10 variants exercising every dropdown / radio / required-field combination." One Test Case → ten Queues.
4. **CI surface.** Once a team repo exists with a Playwright config, GitHub Actions / similar runs queues directly. webspec involvement is zero. Probably a doc + a sample workflow file, not a build artifact.

## Open questions for the v1.4 build session

1. **Where in the extension does Queue composition live?** New top-level tab next to ⚙ Settings? A "Queues" sub-page? A new window?
2. **Queue manifest format.** JSON file alongside the spec (`queue-1.json` + `queue-1.spec.ts`)? Or inferable from the spec alone? Probably JSON — needed for re-rendering after changes.
3. **Repo path configuration UX.** Reuse the auth-profiles Settings model? Chrome file-system access API needs a one-time permission grant per folder.
4. **Slug collisions for Test Cases.** What if Rob and another author both save `create-lead`? Author prefix? Folder per author? Defer until multi-author actually happens?
5. **Where does role config live for queues?** Per-step in the queue manifest (most flexible) vs per-Test-Case default (less verbose). Probably per-step, with Test Case's recorded role as the default.
6. **What about the existing `~/Downloads/webspec/` library?** Keep it as a fallback / staging area? Migration script? Probably: leave it alone, new saves with a repo configured go to the repo, no migration.

## Position relative to other docs

- **`docs/08-test-library.md`** — the v1.4 "Suites" section is superseded by this doc. v1.2 (on-disk library) and v1.3 (auth profiles) still authoritative.
- **`docs/09-test-planning-surface.md`** — Flavor B (notes on existing recordings) overlaps with the Queue composer UI; some of that polish may fall out naturally. Flavor A (plan-before-record) and Flavor C (compose from prose) remain parked; revisit after v1.4.
- **`docs/99-open-questions.md`** — PHI question resolves (synthetic data); env-var auth substitution stays deferred.

## Status

**Active design — implementation starts after this doc settles with Rob.** The v1.4 milestone in `docs/07-build-plan.md` should be updated to point here and renamed from "Suites" to "Queues + Team Shareability."
