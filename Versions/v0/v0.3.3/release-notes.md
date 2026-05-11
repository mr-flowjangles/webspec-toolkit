# v0.3.3 — M4 Node-mode A11yAnalyzer (2026-05-11)

## Problem

M4 is the first milestone on the post-pivot v1 active path (M4 → M5 → M6). It needs to produce a normalized `A11yReport` from a live page against the WCAG 2.1 AA + Section 508 rule sets, and the same normalization has to work from both Node mode (CLI) and browser mode (Chrome extension, M5). Without the Node-mode entry point, there's no way to run an audit from CI or to verify parity between the CLI and the Chrome extension later.

## Solution

Ship the Node-mode `A11yAnalyzer` (`packages/core/src/analyze/a11y/analyzer.ts`) plus a pure normalization function (`packages/core/src/analyze/a11y/normalize.ts`).

- **`A11yAnalyzer`** drives Puppeteer + `@axe-core/puppeteer`. Two entry points: `analyzeUrl({ url, ... })` manages its own headless Chromium lifecycle; `analyzePage({ page, ref, ... })` lets a caller bring its own page (handy for the M5 verification harness later). Defaults to tags `['wcag21aa', 'section508']`.
- **`normalizeAxeResults`** is the pure step: `AxeResults → A11yReport`. Browser-safe — imports only `axe-core` types and the contract schema, no Node deps. M5's content script will call the same function with its own `AxeResults` so audit findings stay identical across surfaces.
- **Severity fallback:** axe's `impact: null` collapses to `'moderate'` (axe's documented default). The contract requires a concrete severity; this avoids spurious validation failures.
- **Tag filtering:** axe results carry many tags (wcag2a, best-practice, etc.); we surface only `wcag21aa` + `section508` on each `Finding.ruleSets`. A finding with neither surfaced tag still emits (with `ruleSets: []`) so report consumers see everything axe flagged at the chosen severity, but the rule-tag column accurately reflects which compliance regime called it out.
- **One finding per node**, not one per rule. Matches the way axe reports its data (a single `image-alt` violation can hit multiple `<img>` elements; each gets its own row in the rendered report).

The `ReportRenderer`, CLI `webspec audit` command, and Chrome-extension browser-mode analyzer are the remaining M4 tasks and land in subsequent patch versions.

## New

- `packages/core/src/analyze/a11y/normalize.ts` — pure `normalizeAxeResults(axeResults, target) → A11yReport`, zod-validated at return.
- `packages/core/src/analyze/a11y/analyzer.ts` — `A11yAnalyzer` class with `analyzeUrl` and `analyzePage` entry points; wraps the normalized report in the `Analysis` envelope (kind: `'a11yReport'`).
- `packages/core/tests/analyze/a11y/normalize.test.ts` — 14 fixture-based tests covering severity mapping, tag filtering, target selector formatting, helpUrl wiring, and counts. No browser launched.
- `packages/core/tests/fixtures/a11y/sample-axe-results.ts` — hand-crafted `AxeResults` fixture covering both-tagged, wcag-only, 508-only, and untagged violations.
- New deps in `packages/core`: `@axe-core/puppeteer ^4.10.2`, `axe-core ^4.10.3`, `puppeteer ^24.0.0`.

## Changed

- `packages/core/src/index.ts` — exports `A11yAnalyzer`, `DEFAULT_A11Y_TAGS`, `normalizeAxeResults`, plus the option/target types. Inline note that `analyzer.js` is Node-only and browser bundles must exclude it (same convention used for `bedrock.js` and `test-plan/parser.js`).

## Fixed

- N/A — first M4 PR; no prior behavior to correct.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/package.json` | Add `@axe-core/puppeteer`, `axe-core`, `puppeteer` deps. |
| `packages/core/src/analyze/a11y/normalize.ts` | New — pure `AxeResults → A11yReport` normalization. |
| `packages/core/src/analyze/a11y/analyzer.ts` | New — Node-mode analyzer driving Puppeteer + axe. |
| `packages/core/src/index.ts` | Export the analyzer + normalize function. |
| `packages/core/tests/analyze/a11y/normalize.test.ts` | New — 14 tests for the normalization contract. |
| `packages/core/tests/fixtures/a11y/sample-axe-results.ts` | New — hand-crafted AxeResults fixture. |
| `Versions/v0/v0.3.3/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **75/75 tests pass** (14 new). The fixture-based tests don't launch a browser, so CI stays fast.

Live smoke test (manual, not in CI): once the M4 CLI surface (`webspec audit <url>`) lands in the next patch, `webspec audit https://example.com` will exercise the full Puppeteer path end-to-end. For now, `A11yAnalyzer` can be driven from a Node REPL or ad-hoc script.
