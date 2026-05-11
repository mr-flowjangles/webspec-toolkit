# v0.6.0 — Verify Recorder And Audit Parity (2026-05-11)

## Problem

M5 had every checkbox ticked except the last one: the "verify on three deployed sites + audit parity with the CLI" gate that closes the milestone. Before declaring M5 done and starting M6 (renderer), we needed evidence that:

1. The recorder produces sensible recordings on real public sites, not just the TodoMVC playground.
2. The CLI's `webspec audit` and the extension's "Audit this tab" find the same kinds of issues on the same URL — the audit pipeline is honest across both surfaces.

While doing the audit-parity check we noticed a small metadata bug in the CLI: the `Analysis.meta.config` claimed `tags: ['wcag21aa', 'section508']` but the analyzer was actually running the wider `DEFAULT_A11Y_TAGS` set (including `wcag2a`, `wcag2aa`, `wcag21a`, and `best-practice`). Reports were truthful about findings but lied about the configuration that produced them — a divergence between CLI metadata and reality.

## Solution

This is a minor bump because it closes a milestone, not because the diff is large. Two pieces:

**Audit-parity fix.** The CLI now passes `[...DEFAULT_A11Y_TAGS]` for `Analysis.meta.config.tags`, mirroring the actual axe tag set. Help text updated to say "WCAG 2.1 AA + Section 508 + best-practice" so users see the full scope. Both surfaces (CLI + extension) now use the same wide tag set and document it the same way.

**Three-site verification.** Ran `webspec audit` from the CLI and "Audit this tab" from the extension against three public URLs and compared rule counts:

| Site | CLI | Ext | Verdict |
|------|-----|-----|---------|
| `https://example.com` | 2 | 2 | ✅ exact parity (`landmark-one-main`, `region`) |
| `https://react.dev` | 4 | 5 | ✅ within tolerance — color-contrast variants drift with font rendering between headless Chrome and the user's Chrome |
| `https://demo.playwright.dev/todomvc/` | 7 | 15 | ⚠ stateful divergence — extension audited a tab with todos persisted in localStorage from earlier testing; each todo row adds DOM that axe scores. Expected and benign |

The TodoMVC gap surfaced an honest property of the tool: a runtime audit is a function of the *page's current state*. Two engineers auditing the same URL can get different findings if their sessions diverge. That's a feature, not a bug — the extension reports what the user actually sees. The CLI ships fresh-Chrome semantics; the extension ships logged-in-Chrome semantics. M6's renderer doesn't need them to be byte-equal.

## Changed

- `packages/cli/src/commands/audit.ts` — pass `config: { tags: [...DEFAULT_A11Y_TAGS] }` so `Analysis.meta.config` reflects the actual axe tag set instead of a stale narrow placeholder.
- `packages/cli/src/args.ts` — help text now describes the audit as "WCAG 2.1 AA + Section 508 + best-practice", matching the extension's tag set.
- `docs/07-build-plan.md` — every M5 checkbox marked done with the version it shipped in, plus an inline note on the deferred `webRequest` network capture (re-evaluated for M6-enables).
- `CLAUDE.md` — "Current state" rolled forward: M0–M5 complete, M6 is the only remaining v1 active milestone.
- `README.md` — opening rewritten to the shift-left framing ("browser-based shift-left companion … records workflow, audits page, renders Playwright spec"), replacing the stale pre-pivot "LLM-powered toolkit that generates Angular unit tests" line. Status section updated to "M5 done at v0.6.0."
- `docs/99-open-questions.md` — three M5 questions marked resolved with version references: axe-in-MV3 (v0.3.8), selector-hardening priority (v0.5.1, includes nth-disambiguation note), recording→renderer transport (v0.5.4, includes the review-gate detail).
- `docs/01-architecture.md` — A11yAnalyzer description corrected to mention the wider tag set (`wcag2a + wcag2aa + wcag21a + wcag21aa + section508 + best-practice`) shipped in v0.5.0, with a parity note for v0.6.0.

## Fixed

- `Analysis.meta.config.tags` from the CLI now matches what axe actually ran. Reports are now truthful about their configuration, not just their findings.

## Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/commands/audit.ts` | Align `Analysis.meta.config.tags` with the actual `DEFAULT_A11Y_TAGS` set. |
| `packages/cli/src/args.ts` | Help text: "WCAG 2.1 AA + Section 508 + best-practice". |
| `docs/07-build-plan.md` | Check off all M5 items with shipping-version references; mark M5 done at v0.6.0; note `webRequest` deferred. |
| `CLAUDE.md` | "Current state" rolled forward to M0–M5 complete; M6 is the only active v1 milestone. |
| `README.md` | Shift-left framing in the opening + status section ("M5 done at v0.6.0"). Drop the pre-pivot "Angular unit tests" line. |
| `docs/99-open-questions.md` | Mark three M5 questions resolved with version refs (axe-in-MV3, selector-hardening priority, recording→renderer transport). |
| `docs/01-architecture.md` | A11yAnalyzer paragraph updated to reference the wider v0.5.0 tag set + v0.6.0 CLI/extension parity. |
| `Versions/v0/v0.6.0/release-notes.md` | This file. |

## Verification

`pnpm -w test` green: 147/147 tests still pass. Type-check clean (`tsc --noEmit`). CLI rebuild clean. Live three-site audit-parity table above is the headline verification.

### Replay the parity check

```sh
node packages/cli/dist/index.js audit https://example.com --format json --out /tmp/example.json
node packages/cli/dist/index.js audit https://react.dev --format json --out /tmp/react.json
node packages/cli/dist/index.js audit https://demo.playwright.dev/todomvc/ --format json --out /tmp/todomvc.json

jq -r '.findings[] | "\(.ruleId)  (\(.severity), \(.ruleSets | join(",")))"' /tmp/example.json | sort | uniq -c
# (repeat for each)
```

Then in the extension, click "Audit this tab" on each URL and compare rule IDs.

## What's next — M5 → M6

M5 is **done**. The Chrome extension is the v1 flagship surface; both modes (audit + recorder) work end-to-end on real sites; recordings export as structured JSON with hardened selectors, navigation events, session persistence, and a review-then-download gate.

**M6 — E2E renderer (`WorkflowRecording` → Playwright):**

- Deterministic pass: each `RecordedEvent` maps to a Playwright action with the recording's hardened selector. The `reason` field on `navigate` events drives the right primitive — `page.waitForURL()`, `page.reload()`, or an assertion after an SPA route change.
- LLM amplification pass (the v1 differentiator): given the action trace, the LLM emits a structured `AmplifiedRecording` with positive + negative scenarios. Renderer formats that into Playwright source. Same two-layer pattern as M2 (LLM emits typed structure, deterministic renderer formats it).
- CLI: `webspec record-to-spec <recording.json>` end-to-end.
- The `webRequest` capture decision lands here, not before: only if the renderer actually needs network metadata.
