# v0.3.9 — M5 Show Rules Checked (2026-05-11)

## Problem

A clean audit report ("0 violations") is not the same as "this page is accessible." Automated audits catch ~57% of WCAG issues at most — the rest needs manual + screen-reader testing. When a JAWS user or 508 reviewer surfaces something the audit missed, the question is always: *did the tool actually test for that?*

Pre-v0.3.9 there was no way to tell. The audit reported counts (`16 passes · 0 incomplete`) but never named the rules. So "did axe even check for skip links?" was unanswerable without leaving the tool and going to axe-core's source.

## Solution

Carry the granular per-rule outcome through the contract artifact and surface it in both the CLI Markdown report and the extension popup.

- **Contract extension.** `A11yReport` now carries `rulesChecked: { ruleId, status }[]`. Status is one of `fail | pass | incomplete | inapplicable` (axe's four buckets per scan). Sorted by `ruleId` for deterministic rendering. Inclusive — every rule axe ran is in the list, with the rule IDs behind `findings` showing as `status: 'fail'`.
- **`normalizeAxeResults`** flattens axe's `violations + passes + incomplete + inapplicable` buckets into the single sorted list. Dedupes defensively even though axe already puts each rule in exactly one bucket per scan.
- **Markdown renderer** gets a `## Rules checked (N)` appendix after the violation sections, with an explainer and **two subsections** so signal isn't drowned by noise:
  - `### Tested (N)` — rules that ran with a meaningful outcome (pass / fail / incomplete). Table columns: `rule | status | reason`. The reason column carries the per-finding `failureSummary` for fail rows; em-dash for pass/incomplete.
  - `### Not applicable (M)` — rules that ran but found no matching elements on the page. Rendered as a comma-separated rule list (not a table) since "N/A" status is implicit. Includes an explainer ("These rules ran but found no matching elements on the page. Nothing to test.") so readers don't mistake this for a coverage gap.
  The appendix emits on clean-but-still-scanned reports too — "clean" + an enumerated rule list lets a reviewer confirm scope.
- **Popup** gets a `<details>` panel split the same way:
  - **Tested** panel (default open) — each rule on its own row with a color-coded status pill (red Fail / green Pass / orange Needs review). Fail rows include a quoted reason line styled with a red accent.
  - **Not applicable** panel (default collapsed) — comma-separated list of rule IDs with a one-line explainer.
  Default state lets the user see scope at a glance without scrolling past 47 inapplicable rules to find the meaningful ones.

When something bites the user that wasn't in the report, they now open this panel, look up the rule, and have one of two honest answers:
1. **The rule was checked and passed/incomplete/inapplicable** → axe's check was wrong or too narrow; flag upstream or augment.
2. **The rule wasn't in the list at all** → our tag filter or axe's catalog doesn't cover that criterion → manual review owns it.

Either way, the audit's coverage is no longer a black box.

## New

- `A11yRuleStatusSchema` + `RuleCheckSchema` in the contract (`packages/core/src/types/analysis.ts`).
- `rulesChecked` field on `A11yReport`.
- `collectRuleChecks` helper in `normalizeAxeResults`.
- `RulesCheckedPanels` React component in the extension popup — two collapsible `<details>` panels (Tested + Not applicable).
- 16 new tests across normalize (`rulesChecked` bucket flattening + dedup + sort) and renderer (split-subsection structure, reason column on Fail rows, comma-list inapplicable rendering, skip-empty-subsection cases).
- Sample fixture: one `inapplicable` rule added so all four status buckets are exercised.

## Changed

- `renderA11yReportMarkdown` always emits the rules-checked appendix when `rulesChecked` is non-empty, including on zero-violation reports. The early-return-on-clean was removed.
- Popup CSS gained a `.rules-checked` panel + colored `.rule-status` pills.

## Fixed

- N/A.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add `A11yRuleStatusSchema`, `RuleCheckSchema`, `rulesChecked` on `A11yReportSchema`. |
| `packages/core/src/analyze/a11y/normalize.ts` | Populate `rulesChecked` from all four axe buckets. |
| `packages/core/src/render/a11y/renderer.ts` | Append `## Rules checked (N)` section with table + explainer. |
| `packages/chrome-extension/src/popup/ReportView.tsx` | Add `RulesCheckedPanel` collapsible. |
| `packages/chrome-extension/src/popup/popup.css` | Styles for the panel + status pills. |
| `packages/core/tests/fixtures/a11y/sample-axe-results.ts` | Add one `inapplicable` rule. |
| `packages/core/tests/analyze/a11y/normalize.test.ts` | 6 new `rulesChecked` tests. |
| `packages/core/tests/render/a11y/renderer.test.ts` | 5 new appendix tests; existing fixtures updated with `rulesChecked: []`. |
| `Versions/v0/v0.3.9/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **126/126 tests pass** (16 new), library build clean, extension Vite bundle clean.

### Live smoke

1. `make build && make ext-build` (or `make ci`).
2. `chrome://extensions` → reload the webspec card.
3. **CLI side:** `node packages/cli/dist/index.js audit https://example.com` — output now ends with a `## Rules checked (16)` table listing every rule axe ran. Useful to confirm CLI/popup parity.
4. **Extension side:** open `https://example.com`, click webspec, **Audit this tab**.
   - **Expected:** "Clean — N passes · M incomplete." summary, **Copy as Markdown** button, then an explainer line and two `<details>` panels: **Tested (M)** open by default with green Pass pills + (if any) red Fail pills with quoted reasons, and **Not applicable (K)** collapsed showing the comma-separated rule list when expanded.
5. Click **Copy as Markdown** → paste — output now includes the appendix split into `### Tested` and `### Not applicable` subsections; matches what the CLI emits.
