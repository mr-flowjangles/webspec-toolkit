# v0.3.6 — M4 Widen WCAG Tag Filter (2026-05-11)

## Problem

The v0.3.5 CLI smoke test surfaced a real reporting gap. We were running axe-core with `withTags(['wcag21aa', 'section508'])` and surfacing only those two tags on output. But axe tags rules by the specific WCAG criterion they cover — `image-alt` (1.1.1) is tagged `wcag2a`, not `wcag21aa`; same for `label`, `html-has-lang`, and other Level A rules. "WCAG 2.1 AA compliance" by W3C convention requires meeting Level A *and* Level AA criteria combined, so the strict `wcag21aa`-only filter was underreporting in two ways:

1. **Findings that were emitted** got mislabeled as Section 508 only when they were also WCAG violations (`image-alt`, `label` on the broken-HTML smoke).
2. **Findings that should have been emitted weren't surfaced at all** — axe wasn't even running rules tagged `wcag2a` because we never asked for them. Pre-v0.3.6 the same broken page returned 2 violations; post-v0.3.6 it returns 4.

Logged as an open question in v0.3.5; closing it here as a clean single-purpose PR before M5 starts.

## Solution

Widen the tag set everywhere it appears, end-to-end. Contract carries the fine-grained breakdown; renderer rolls it up for display.

- **Contract** (`packages/core/src/types/analysis.ts`): `A11yRuleTagSchema` enum widened to `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508']`. Downstream consumers see the granular tags on each `Finding.ruleSets`.
- **Normalizer** (`packages/core/src/analyze/a11y/normalize.ts`): `SURFACED_TAGS` matches the new enum; `A11yReport.ruleSet.tags` now lists all five surfaced tags.
- **Analyzer input** (`packages/core/src/analyze/a11y/analyzer.ts`): `DEFAULT_A11Y_TAGS` widened so axe-core actually runs the Level A rules. This is the load-bearing fix — without it, the additional findings simply don't exist.
- **Renderer display** (`packages/core/src/render/a11y/renderer.ts`): single `humanizeRuleSets` helper used by both the header (`axe-core vX · WCAG 2.1 AA + Section 508`) and the per-row Sets cell. Any `wcag*` tag in a finding → single "WCAG 2.1 AA" label; `section508` → "Section 508". No granular Level-A/Level-AA split — the question users actually ask is "am I WCAG 2.1 AA compliant?", and a single label answers it cleanly.

The change is invisible to downstream consumers reading `Finding.ruleSets` programmatically (the new tags are additive — pre-v0.3.6 callers checking `includes('wcag21aa')` keep working). The visible delta is: more findings, and Level-A findings carry a WCAG label.

## New

- One new renderer test (`treats Level A wcag tags as a WCAG label, not a Section-508-only finding`) that pins the v0.3.6 behavior so it can't regress silently.

## Changed

- `packages/core/src/types/analysis.ts` — `A11yRuleTagSchema` enum widened to 5 tags. Inline note on the rollup-for-display contract.
- `packages/core/src/analyze/a11y/normalize.ts` — `SURFACED_TAGS` widened.
- `packages/core/src/analyze/a11y/analyzer.ts` — `DEFAULT_A11Y_TAGS` widened. The comment now explains *why* (axe tags rules by specific criterion).
- `packages/core/src/render/a11y/renderer.ts` — `humanizeRuleSets` helper introduced, used by both the header and the Sets-cell renderer.
- `packages/core/tests/analyze/a11y/normalize.test.ts` — three assertions updated to reflect the new ruleSets shapes. Test names rewritten to describe the new behavior (one explicitly calls out "the v0.3.6 fix" so the trail is obvious).
- `packages/core/tests/render/a11y/renderer.test.ts` — old `renders ruleSets as humanized labels` test split into two: one for the rollup, one for the Level-A fix.
- `docs/99-open-questions.md` — v0.3.5 entry on Level A inclusion marked resolved with a pointer to this PR.

## Fixed

- A11y audits no longer underreport WCAG 2.1 AA violations. Same broken HTML now reports 4 violations instead of 2; Level-A failures (`image-alt`, `label`) carry the WCAG label they always should have had.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Widen `A11yRuleTagSchema` enum. |
| `packages/core/src/analyze/a11y/normalize.ts` | Widen `SURFACED_TAGS`. |
| `packages/core/src/analyze/a11y/analyzer.ts` | Widen `DEFAULT_A11Y_TAGS`. |
| `packages/core/src/render/a11y/renderer.ts` | Introduce `humanizeRuleSets`; both header and rows roll up. |
| `packages/core/tests/analyze/a11y/normalize.test.ts` | Update ruleSets assertions + test descriptions. |
| `packages/core/tests/render/a11y/renderer.test.ts` | Split humanizer test; add Level-A regression pin. |
| `docs/99-open-questions.md` | Mark Level-A question resolved. |
| `Versions/v0/v0.3.6/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **110/110 tests pass** (one new).

**Before / after on the same deliberately-broken HTML:**

```
$ node packages/cli/dist/index.js audit file:///tmp/webspec-broken.html

# Before (v0.3.5):
**2 violations** · 2 passes · 0 incomplete.
## Critical (2)
| [image-alt](...) | Section 508 | `img` | ...
| [label](...) | Section 508 | `input` | ...

# After (v0.3.6):
**4 violations** · 7 passes · 0 incomplete.
## Critical (2)
| [image-alt](...) | WCAG 2.1 AA, Section 508 | `img` | ...
| [label](...) | WCAG 2.1 AA, Section 508 | `input` | ...
## Serious (2)
| [color-contrast](...) | WCAG 2.1 AA | `button` | ...
| [html-has-lang](...) | WCAG 2.1 AA | `html` | ...
```

Both the label fix (existing findings) and the coverage fix (new findings) verified in one smoke run.
