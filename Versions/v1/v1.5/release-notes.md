# v1.5

## v1.5.0 — Reusable Test Cases (2026-05-20)

### Problem

v1.4 MVP knowingly inlined each Test Case's recorded events into every Queue spec that referenced it: if `create-lead` was a step in Queue A and Queue B, the body lived twice. Painful at 8+ queues, and a maintenance trap — fix a selector in `create-lead` and you have to remember to re-render every Queue using it. `docs/10` § "v1.5+ futures" called Reusable Test Cases out as #1 in the priority list for exactly this reason.

### Solution

Each Test Case now ships as a helper module that Queue specs **import** instead of inlining. Single source of truth per Test Case: edit it once → every Queue picks up the fix on its next render.

**New on-disk layout** under `<repo>/test-cases/<slug>/`:

```
recording.json          # raw WorkflowRecording (unchanged)
recording.ts            # NEW — exports `async function run({ page, context })`
recording.spec.ts       # CHANGED shape — thin wrapper that imports run() and applies recorded auth
playwright.config.ts    # per-test config (unchanged)
```

**Helper module (`recording.ts`).** New `renderTestCaseModule(recording)` in `@webspec/core` emits a TypeScript module with one named export: `async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void>`. The body is the recording's `page.goto(startUrl)` + each `RecordedEvent` re-emitted via the shared `renderEvent` helper. **The helper does NOT touch headers** — auth is the caller's concern. That keeps the helper reusable across contexts: the standalone Test Case spec applies the recording's baked-in `recording.auth` headers; Queue specs apply the resolved per-step `AuthProfile` headers (which can differ per step).

**Thin Test Case spec wrapper (`recording.spec.ts`).** New `renderTestCaseSpec(recording)` emits `import { test } from '@playwright/test'; import { run } from './recording.js';` then one `test()` that optionally sets baked-in auth headers and calls `await run({ page, context })`. The Test Case stays standalone-runnable via `npx playwright test`. The import uses `.js` because that's what Playwright's TS loader resolves to the `.ts` source under NodeNext / ESM.

**Queue renderer rewrite (`renderQueueSpec`).** Step bodies stop inlining. Imports gather at the top of the spec, deduped per unique slug, sorted alphabetically for stable diffs:

```ts
import { run as createLead } from '../test-cases/create-lead/recording.js';
import { run as fillDetails } from '../test-cases/fill-details/recording.js';
```

Step `test()` blocks become:

```ts
test('Step 1 — create-lead (as ANALYST01)', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ uid: 'ANALYST01' });
  await createLead({ page, context });
});
```

The import alias is a slug-derived camelCase identifier (`create-lead` → `createLead`) via a new `slugToIdentifier` helper in `@webspec/core/library/slug`. Iterations wrap the helper call, not the inlined events. Header-switching semantics (set headers only when the resolved set changes between steps) are unchanged. The Queue renderer still consumes `recordings` because `recording.startUrl` drives `matchProfile`, even though the events themselves now live in the imported helper.

**Self-heal at Queue render time.** Test Cases saved pre-v1.5.0 have only the inlined `recording.spec.ts` shape and no `recording.ts`. Rather than ship a migration script, `saveQueueWithSpec` calls a new `ensureTestCaseHelpers(rootHandle, recordings)` step before rendering: for every referenced slug, if `recording.ts` is missing, render it from the corresponding `recording.json` and write it. Saves both the spec and re-saves of the spec are now self-healing — no manual migration. Existing `recording.ts` files are left alone (the user may have hand-edited).

**Popup save updated.** The Test Case save flow (`popup/App.tsx → trySaveToRepo`) writes all four files for both repo and Downloads paths. The signature added a `helperModule` argument; both branches use `renderTestCaseModule` + `renderTestCaseSpec`.

**Design captured.** `docs/10-team-shareability.md` gained a "v1.5.0 — Reusable Test Cases (design locked, 2026-05-20)" section above the futures list, covering file layout, helper signature, Queue renderer change, path resolution (`../test-cases/<slug>/recording.js`), the rename-coupling tradeoff, and the self-heal strategy.

### New

- `packages/core/src/render/test-case/renderer.ts` — `renderTestCaseModule` + `renderTestCaseSpec` pure functions.
- `packages/core/tests/render/test-case/renderer.test.ts` — 13 tests (module structure, run() signature, JSDoc, no-headers invariant, inline snapshot; spec wrapper imports + auth header conditional).
- `packages/core/src/library/slug.ts` gains `slugToIdentifier(slug)` — kebab → camelCase, digit-leading guard.
- `packages/core/tests/library/slug.test.ts` gains 6 `slugToIdentifier` tests.
- `packages/chrome-extension/src/shared/queues.ts` gains `ensureTestCaseHelpers(rootHandle, recordings)` — self-heals missing `recording.ts` files from `recording.json`.
- `packages/chrome-extension/tests/queues.test.ts` gains 6 tests covering `ensureTestCaseHelpers`, `loadRecordingsForQueue`, and the self-heal integration in `saveQueueWithSpec`.

Total tests: 379/379 passing (+38 over v1.4.3's 341).

### Changed

- `packages/core/src/render/queue/renderer.ts` — rewritten to emit imports + helper calls instead of inlining recorded events. Old golden test snapshots replaced with new ones reflecting the import-based shape.
- `packages/core/tests/render/queue/renderer.test.ts` — full rewrite to match the new output. New tests for import dedup, alphabetical import sort, and `{ page, context }` always being destructured.
- `packages/core/src/browser.ts` + `packages/core/src/index.ts` — re-export `renderTestCaseModule`, `renderTestCaseSpec`, and `slugToIdentifier`.
- `packages/chrome-extension/src/popup/App.tsx` — Test Case save renders both `recording.ts` (helper) and `recording.spec.ts` (thin wrapper); `trySaveToRepo` signature now takes the helper module as a separate argument.
- `packages/chrome-extension/src/shared/queues.ts` — `saveQueueWithSpec` calls `ensureTestCaseHelpers` before rendering; result type adds `healedHelpers: string[]` for UI reporting.
- `docs/10-team-shareability.md` — added the locked v1.5.0 design section.

### Fixed

- N/A (additive + refactor; no bug fixes).

### Files Changed

| File | Change |
|------|--------|
| `docs/10-team-shareability.md` | **New section** — v1.5.0 design locked. |
| `packages/core/src/render/test-case/renderer.ts` | **New** — Test Case helper-module + thin-spec renderers. |
| `packages/core/tests/render/test-case/renderer.test.ts` | **New** — 13 tests. |
| `packages/core/src/library/slug.ts` | Added `slugToIdentifier`. |
| `packages/core/tests/library/slug.test.ts` | Added 6 `slugToIdentifier` tests. |
| `packages/core/src/render/queue/renderer.ts` | Rewritten — emits imports + helper calls. |
| `packages/core/tests/render/queue/renderer.test.ts` | Rewritten to match new output. |
| `packages/core/src/browser.ts` | Re-exports new renderers + `slugToIdentifier`. |
| `packages/core/src/index.ts` | Same. |
| `packages/chrome-extension/src/shared/queues.ts` | Added `ensureTestCaseHelpers`; `saveQueueWithSpec` self-heals. |
| `packages/chrome-extension/tests/queues.test.ts` | Added 6 self-heal / load tests. |
| `packages/chrome-extension/src/popup/App.tsx` | Test Case save writes both `recording.ts` and `recording.spec.ts`. |
| `Versions/v1/v1.5/release-notes.md` | This entry. |

### Known issues / notes

- **Manual verification still pending** (carried forward from v1.4.2 + this patch): fresh empty folder → save a Test Case → expect `recording.ts` + new thin `recording.spec.ts` + bootstrap prompt + 4 files. Save a Queue with that Test Case → expect a queue spec that compiles (`npx playwright test`) and the inlined-import shape (`await createLead({ page, context })`).
- **Pre-v1.5.0 Test Cases work transparently** thanks to the self-heal: open a Queue using one, hit Save, and `recording.ts` appears.
- **Rename coupling acknowledged.** Renaming a Test Case slug (not implemented as UI yet) would break existing Queue spec imports until the user re-renders. Not a v1.5.0 concern; design note in `docs/10`.
- **Next up: v1.5.1 input/output wiring** — Test Cases declare outputs (`createLead → { leadId }`), Queues wire them between steps. The helper signature is fixed at `{ page, context }` for now.