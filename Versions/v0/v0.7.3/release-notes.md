# v0.7.3 — M6 Integration Test (2026-05-12)

## Problem

By v0.7.2 the pipeline was code-complete on paper: a captured `WorkflowRecording` flows through the deterministic renderer (v0.7.0) or the LLM amplifier (v0.7.2) into a Playwright `.spec.ts`. The 232 unit and golden tests covered every action, every selector strategy, every navigate reason, every schema constraint. But nothing in the test suite actually *ran* a rendered spec through Playwright's runner against a real browser. The full loop — recording → render → run → pass — had never been closed end-to-end.

`docs/06-renderer.md` named the missing piece: a hermetic local fixture under `tests/fixtures/playwright-target/`, a recording of a user flow on it, and an integration test that renders the recording and watches the rendered spec execute. That's v0.7.3.

## Solution

Three pieces:

**Fixture.** `tests/fixtures/playwright-target/form.html` — a single signup-style HTML page with an email input, a country dropdown, a subscribe checkbox, a submit button, and a hidden success message that appears after `submit`. ~30 lines. Self-contained: no build, no server, no network. Loaded by the rendered spec via `file://`. Covers `input` (fill), `change` on `<select>` (selectOption), `change` on checkbox (check), `click`, and post-action visibility — five of the deterministic mapping rows in one fixture.

**Recording.** Hand-built in TypeScript inside the integration test itself. The fixture lives at an absolute path on disk; the recording's `startUrl` is `file://${absolutePath}` resolved at test time. Selector hardening produces `role=textbox[name="Email"]`, `role=combobox[name="Country"]`, etc. — same shape the real recorder would emit on this HTML.

**Integration test.** `packages/cli/tests/integration/render-and-run.integration.test.ts`:

1. Builds the `WorkflowRecording` in memory.
2. Calls `renderPlaywrightSpec(recording)` — exercises the v0.7.0 deterministic path.
3. Writes the rendered spec to a gitignored `.tmp/` directory under the integration-test folder (so `@playwright/test` resolves from `packages/cli/node_modules`).
4. Spawns `npx playwright test --config <inline-config> <rendered-spec>` — the actual Playwright test runner, headless Chromium, real browser.
5. Asserts exit code 0. On failure, surfaces the runner's stdout/stderr so the cause is debuggable rather than just an exit-code mismatch.

Runs in ~1.7s on the warm path (after Chromium's been downloaded). The cold path requires a one-time `npx playwright install chromium` (~90 MB). No mocking — the rendered spec is the actual artifact the CLI would emit; Playwright is the actual runner the user would use.

## New

- `tests/fixtures/playwright-target/form.html` — minimal signup form fixture. Email input + country select + subscribe checkbox + submit button + success message.
- `packages/cli/tests/integration/render-and-run.integration.test.ts` — vitest integration test that drives the full pipeline and shells out to Playwright.

## Changed

- `packages/cli/package.json` — add `@playwright/test` (^1.60.0) as a devDependency.
- `pnpm-lock.yaml` — locked Playwright + its dependency closure.
- `.gitignore` — ignore Playwright's `test-results/`, `playwright-report/`, and the integration test's per-run `.tmp/` directory.

## Files Changed

| File | Change |
|------|--------|
| `tests/fixtures/playwright-target/form.html` | New — hermetic HTML fixture covering input / select / checkbox / submit. |
| `packages/cli/tests/integration/render-and-run.integration.test.ts` | New — full-loop integration test (render → spawn Playwright → assert exit 0). |
| `packages/cli/package.json` | Add `@playwright/test` devDependency. |
| `pnpm-lock.yaml` | Lock the Playwright dependency closure. |
| `.gitignore` | Ignore Playwright runner artifacts and the per-run integration `.tmp/`. |
| `Versions/v0/v0.7.3/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: **233/233** tests pass (232 prior + 1 new integration test). The integration test runs by default — no opt-in flag — and takes ~1.7s on a warm Chromium install. Type-check clean. Vite bundle clean.

### What this proves

Before v0.7.3, the pipeline's correctness relied on three independent sources of evidence:

1. Schema validation tests for every IR shape.
2. Golden tests for the deterministic renderer (24) + amplified renderer (10).
3. Manual three-site smoke at v0.6.0 (recorder + audit).

Each of those left the same gap: do the strings we emit actually compile, launch a browser, navigate to the recorded URL, perform the recorded actions, and exit cleanly? v0.7.3 answers yes, with a real Chromium process, real `await page.fill()` calls, and a real form submit.

### First-time setup

If `npx playwright install chromium` hasn't been run on a machine, the integration test fails with Playwright's own clear message ("Please install browsers..."). One-line fix. No code change. CI integration is deferred — the test runs locally as part of the regular suite.

## What's next

M6 is **functionally complete**. v1 DoD outstanding items:

- **Live amplifier verification on AWS Bedrock.** The amplifier code path is goldenable but hasn't fired against a real model yet. Lands the day AWS credentials are wired.
- **Recorder → render parity on three real deployed sites.** v0.6.0 verified audit parity on three sites; the renderer half of that verification (record on each, render, run) wasn't done because the renderer didn't exist yet. Now it does.
- **README quickstart** that walks an unfamiliar reader from "clone the repo" to "first rendered spec." Drafted but stale — needs an update against the current CLI surface.

When those are checked, the next bump is `v1.0.0` — the v1 Definition of Done at the top of `docs/07-build-plan.md`.
