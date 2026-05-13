# v0.7.4 — M6 Amplification Pass Golden (2026-05-13)

## Problem

The M6 build-plan box at `docs/07-build-plan.md:144` asked for a golden test of "the amplification pass against a recorded-LLM-response fixture (deterministic test of 'given this recording + this LLM response, render this spec')." Reading that as written, it describes a single end-to-end golden: `WorkflowRecording` in → fake LLM stand-in returns a canned `AmplifiedRecording` → `renderAmplifiedPlaywrightSpec` → snapshot the `.spec.ts`.

What we actually had through v0.7.3 was two half-goldens — `tests/analyze/amplify/analyzer.test.ts` pinned the analyzer with a fake provider, `tests/render/e2e/amplified.test.ts` pinned the IR-to-source renderer with hand-written fixtures — but nothing wired them together. That coverage is logically sufficient (each half is pinned, so the composition is determined), but it's not what the box says, and a regression in how the analyzer's output shape meets the renderer's input expectations could slip past both half-goldens.

The same audit surfaced two stale checkboxes in the build plan that no longer reflected reality:

- M4's `A11yAnalyzer` (browser mode) box was unticked but had a note saying it had been folded into M5. The work actually shipped in v0.3.8 as part of content-script axe injection.
- M5's `webRequest` outgoing-request capture box was deferred to "M6-enables" — the decision was "let the renderer decide whether it needs network metadata before we pay for capture." M6 is now far enough along to answer: the deterministic renderer and the amplifier both ignore `WorkflowRecording.network`, and `docs/06-renderer.md:150` explicitly puts recorded-network mocking out of v1. The schema field stays as a forward-compat seam.

## Solution

**End-to-end golden.** `packages/core/tests/render/e2e/amplification-pass.test.ts` composes both halves:

1. A small hand-written `WorkflowRecording` — login flow with email input, password input, sign-in click.
2. A canned `AmplifiedRecording` standing in for the LLM's response — the recorded happy scenario plus one negative variant (empty password).
3. `AmplifyAnalyzer` instantiated with a fake `LLMProvider` (same `vi.fn` pattern as the existing analyzer tests) that returns the canned response.
4. The analyzer's output flows into `renderAmplifiedPlaywrightSpec`, and the result is pinned with `toMatchInlineSnapshot` — same style as the existing renderer goldens.

The snapshot captures two `test()` blocks with role-based locators, description comments, the visibility assertion on the happy path, and the `toContainText` assertion on the negative — exactly the shape a v1 Playwright spec should have. A regression in either the analyzer's plumbing or the renderer's source emission, or in how their boundary types line up, breaks this snapshot.

A second assertion verifies that the recording flows through to the LLM call without mutation (the user message contains `user@example.com`, `Sign in`, and the start URL verbatim).

**Build-plan housekeeping.** Two stale checkboxes resolved against current reality:

- M4 browser-mode `A11yAnalyzer` ticked with a v0.3.8 annotation.
- M5 `webRequest` capture struck through with an out-of-v1 note explaining the M6 audit that retired it.

## New

- `packages/core/tests/render/e2e/amplification-pass.test.ts` — end-to-end golden for the M6 amplification pass. Two tests (snapshot of the rendered spec; provider-input verification), 186 → 188 total tests passing.

## Changed

- `docs/07-build-plan.md` — three closures: M4 browser-mode box ticked with v0.3.8 annotation; M5 webRequest box struck through with out-of-v1 note; M6 amplification-pass-golden box ticked with this PR's annotation.

## Fixed

_None — pure addition + doc housekeeping._

## Files Changed

| File | Change |
|------|--------|
| `packages/core/tests/render/e2e/amplification-pass.test.ts` | New — end-to-end golden composing analyzer + renderer. |
| `docs/07-build-plan.md` | M4 browser-mode box ticked, M5 webRequest box struck through, M6 amplification-pass-golden box ticked. |
| `Versions/v0/v0.7.4/release-notes.md` | This file. |

## What's next

M6's checkbox state after this PR: six of seven sub-bullets ticked. The remaining ones at the v1 DoD level (live Bedrock amplifier run; recorder→render parity on three deployed sites; README quickstart pass) aren't M6 sub-bullets — they're the v1 DoD items that gate `v1.0.0`. A future minor bump declares M6 itself done; the patch sequence likely closes the three DoD items first.
