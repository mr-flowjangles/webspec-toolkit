# v0.1.1 — Front-load Chrome ext + CLI init (2026-05-07)

## Problem

The build plan as written treats "easy to use" as something each surface earns independently. But "easy" has two audiences with very different floors: developers (who can fall back to the CLI) and non-developers — 508 reviewers, QA, designers, PMs — who cannot. The Chrome extension is the only surface that admits the second audience. Sequencing it after the VS Code extension means the lowest-floor surface lands last, when it should arguably be the showcase. Separately, the CLI in M3 has no onboarding step — a new user has to know about three install URLs, write a config file by hand, and figure out where to put their LLM key.

## Solution

Two refinements to `docs/07-build-plan.md`, no code changes:

1. **Swap M5 and M6.** Chrome extension becomes M5 (front-loaded as the flagship "easy to use" surface); VS Code extension becomes M6. Dependencies still resolve cleanly — Chrome only needs `core` + the `A11yAnalyzer` from M4, no VS Code work in between.
2. **Add `bellese-test init` to M3.** Single command that detects the Angular project, drops a sane `bellese-test.config.json`, prompts once for LLM provider + key (stored via OS keychain), and prints install URLs for the Chrome and VS Code extensions. Idempotent so re-running is safe.

Knock-on edits to keep the milestone numbers consistent: `docs/99-open-questions.md` (the Manifest V3 question's resolution trigger now points to M5), and the milestone numbers in the chrome- and vscode-extension package stub comments.

## New

- **`bellese-test init` task** added to M3 — onboarding wizard. Detects Angular project, writes config, prompts for LLM provider + key via OS keychain, prints extension install URLs.
- **Reasoning in the M5 heading** — "the flagship 'easy to use' surface" — captures _why_ Chrome went first so a future reader doesn't reorder it back.

## Changed

- **`docs/07-build-plan.md`.** M5 = Chrome extension; M6 = VS Code extension. M3 gained the `init` task and an updated "Done when" criterion.
- **`docs/99-open-questions.md`.** The Manifest V3 service-worker question's resolution trigger updated from "M6 implementation" to "M5 implementation".
- **`packages/chrome-extension/src/index.ts`.** Stub comment now says M5.
- **`packages/vscode-extension/src/index.ts`.** Stub comment now says M6.

## Fixed

- (n/a)

## Files Changed

| File | Change |
| ---- | ------ |
| `docs/07-build-plan.md` | Changed — swapped M5/M6 ordering; added M3 `init` task + updated done-when |
| `docs/99-open-questions.md` | Changed — Manifest V3 resolution trigger updated to M5 |
| `packages/chrome-extension/src/index.ts` | Changed — stub comment now references M5 |
| `packages/vscode-extension/src/index.ts` | Changed — stub comment now references M6 |
| `Versions/v0/v0.1.1/release-notes.md` | New — this file |
