# v0.6.2 — M6 Renderer Design (2026-05-12)

## Problem

M5 closed at v0.6.0 and the recorder gained option capture at v0.6.1, so the upstream artifact is settled. But the M6 implementation can't responsibly start until the design questions the build plan left vague are answered: which Playwright actions does the IR support, which assertions, how does each `navigate.reason` render, what's the integration-test target, and what does the renderer do with ambiguous selectors. Without those locked, v0.7.0 would land code that contradicts decisions we haven't actually made.

Per the project working norm ("design before code, recorded in `docs/`, then implemented"), the design needs to ship as its own version before the implementation does.

## Solution

A single new design doc, `docs/06-renderer.md`, that records the five M6 decisions reached in the v0.6.2 planning walk-through. No code. The next version (v0.7.0) implements the deterministic pass against this doc.

The five locked decisions:

1. **Action set.** Six IR actions (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`) plus two derived from `change` events (`selectOption`, `check`/`uncheck`).
2. **Assertion set.** Seven matchers (`visible`, `hidden`, `text`, `url`, `count`, `value`, `checked`).
3. **`navigate.reason` mapping.** `navigate` → `waitForURL`; `reload` → `reload()`; `history`/`hash` → `expect(page).toHaveURL(url)` assertion. The asymmetry (some reasons emit actions, others emit assertions) is deliberate — there's no Playwright action to "do" a hash change.
4. **Integration test target.** Hermetic local fixtures under `tests/fixtures/playwright-target/`, loaded via `file://`. No hosted-site dependency in CI; real-world sites stay verified through the v0.6.0 three-site manual pass.
5. **Ambiguous selectors.** Render every event with `selector.preferred` as captured. No skips, no warning comments. Selector quality is fixed upstream in `selectors.ts`.

The doc also sketches the `AmplifiedRecording` IR shape (typed `actions[]` and `assertions[]`) and lists v1 non-goals (visual diffs, network mocks, multi-select, extension playback, Cypress/Jasmine renderers).

## New

- `docs/06-renderer.md` — the M6 E2E renderer design doc. Covers the five locked decisions, the IR sketch, the two-pass output examples (deterministic-only and amplified), and the v0.7.0 → v1.0.0 implementation sequence.

## Changed

- `docs/07-build-plan.md` — M6 section header now points at `docs/06-renderer.md` for the design contract.

## Files Changed

| File | Change |
|------|--------|
| `docs/06-renderer.md` | New — M6 renderer design doc. |
| `docs/07-build-plan.md` | Add "Design: see `docs/06-renderer.md`" pointer in the M6 header. |
| `Versions/v0/v0.6.2/release-notes.md` | This file. |

## Verification

Docs-only PR — no code changes. `pnpm -w test` still green (147/147 unchanged). The verification that matters is reading the doc and confirming it captures everything the walk-through landed on. v0.7.0 will be the first version that depends on `06-renderer.md` being right.

## What's next

v0.7.0 implements the deterministic pass exactly as specified in `06-renderer.md`:

1. `packages/core/src/render/e2e/` — pure `WorkflowRecording → string` renderer that maps each `RecordedEvent` to the Playwright primitive named in the action-set table.
2. `packages/cli/src/commands/record-to-spec.ts` — wires `webspec record-to-spec <recording.json>` to the renderer, writes `recording.spec.ts` next to the input.
3. Golden tests against hand-written `WorkflowRecording` fixtures (no LLM in the loop).
4. The local fixture (`tests/fixtures/playwright-target/`) stays minimal at v0.7.0; expands as v0.7.3 needs more coverage for the integration test.
