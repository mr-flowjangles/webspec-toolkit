# v0.3.4 — M4 ReportRenderer (2026-05-11)

## Problem

v0.3.3 shipped the Node-mode `A11yAnalyzer` and produced an `A11yReport`, but consumers can't *do* anything with it yet. The build plan calls for "JSON and Markdown" output with "severity grouping, rule tag column, selector + fix-hint per finding." Both the CLI's `webspec audit` output and the Chrome extension's "Copy report" button need this renderer before they can ship.

## Solution

Two pure functions in `packages/core/src/render/a11y/renderer.ts`, mirroring the M2 renderer pattern:

- **`renderA11yReportMarkdown(report)`** — severity-grouped Markdown report.
  - H1 title with the target URL.
  - Engine + rule-set line (`axe-core v4.10.3 · WCAG 2.1 AA + Section 508`).
  - One-line summary (`**5 violations** · 3 passes · 1 incomplete.` — singularized at count 1).
  - Severity sections in `critical → serious → moderate → minor` order, each with a per-bucket count in the heading.
  - Per-section table: rule (linked to helpUrl when present) | rule sets (humanized "WCAG 2.1 AA" / "Section 508", em-dash when neither tag surfaced) | selector (inline code, pipe + backtick escaped) | issue (multi-line `failureSummary` collapsed to one line, pipes escaped so the table doesn't break).
  - Zero-findings short-circuit: `**Clean — no violations.** N passes · M incomplete.` and skip the section tables entirely.
- **`renderA11yReportJson(report)`** — pretty-printed JSON (2-space indent), round-trippable through the `A11yReportSchema`. Thin wrapper so the CLI's `--format json` flag has a symmetric API.

Both functions are browser-safe — string ops + `JSON.stringify`, no Node deps. The Chrome extension popup will call `renderA11yReportMarkdown` directly for its "Copy report" button.

## New

- `packages/core/src/render/a11y/renderer.ts` — `renderA11yReportMarkdown` + `renderA11yReportJson`.
- `packages/core/tests/render/a11y/renderer.test.ts` — 18 tests. Pipes the existing axe fixture through `normalizeAxeResults` for realistic findings; inline minimal fixtures cover edge cases (zero findings, missing helpUrl, pipe escaping, multi-line `failureSummary`, singular "violation"); JSON round-trips through `A11yReportSchema`.

## Changed

- `packages/core/src/index.ts` — exports both renderers, with the same browser-safe-renderer convention used for `renderTestPlan`.

## Fixed

- N/A.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/a11y/renderer.ts` | New — Markdown + JSON renderers. |
| `packages/core/src/index.ts` | Export the renderers. |
| `packages/core/tests/render/a11y/renderer.test.ts` | New — 18 tests (sample-fixture + edge cases + JSON round-trip). |
| `Versions/v0/v0.3.4/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **93/93 tests pass** (18 new). The renderer is exercised end-to-end against the same axe fixture that backs the normalize tests, so any regression in either step shows up here too.

Live smoke deferred to the next M4 PR (`webspec audit <url>` CLI), which will wire the analyzer + renderer behind a `--format md|json` flag.
