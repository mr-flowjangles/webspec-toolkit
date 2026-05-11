# v0.3.5 — M4 CLI webspec audit (2026-05-11)

## Problem

v0.3.3 + v0.3.4 shipped the Node-mode `A11yAnalyzer` and Markdown/JSON renderers, but only as library code. There's no user-facing surface yet — no way to run an audit from a terminal or wire one into CI. Without that, the M4 pipeline can't be smoke-tested end-to-end against a real page, and the v1 DoD line "thin CLI for CI integration: `webspec audit <url>`" can't be checked.

## Solution

Real `webspec audit` command, wired through the existing `packages/cli` stub. Hand-rolled arg parser (one subcommand, two flags — no library justified); pure parser + command split for testability.

- **`webspec audit <url>`** runs the M4 pipeline: launches headless Chromium via Puppeteer, injects axe-core, normalizes the result into `A11yReport`, renders to stdout (or `--out <path>`) as Markdown (default) or JSON.
- **Flags:** `--format md|json` (defaults to `md`), `--out <path>` (defaults to stdout). Unknown commands / flags / missing args produce a useful error message + help text on stderr.
- **Exit codes:** `0` clean run regardless of findings; `1` runtime error (puppeteer/network/FS); `2` bad arguments. No CI-gating on finding count yet — that needs a separate `--fail-on` flag and a deliberate design choice.
- **Stderr summary:** every successful run prints `webspec audit: N violations · wrote to <dest>` so CI logs are scannable without parsing the report.

**This is the first PR that smoke-tests M4 end-to-end against live pages.** Verified manually against `example.com` (clean), `github.com` (clean), `html5accessibility.com` (clean), and a deliberately broken local `file://` HTML page (2 critical findings, rendered correctly into the markdown table).

## New

- `packages/cli/src/args.ts` — pure arg parser returning a discriminated union (`audit | help | error`). 16 unit tests covering valid + error paths.
- `packages/cli/src/commands/audit.ts` — `runAudit(cmd)` wires `A11yAnalyzer` + renderer; writes to stdout or `--out` path.
- `packages/cli/src/version.ts` — `CLI_VERSION` constant stamped into `Analysis.meta.toolVersion`.
- `packages/cli/tests/args.test.ts` — 16 parser tests.

## Changed

- `packages/cli/src/index.ts` — replaced the M0 stub with a real entry point: parse → dispatch → I/O → exit. Help text reflects the actual current command set.
- `docs/99-open-questions.md` — new entry: "Should the a11y rule-set tag filter include `wcag2a` (Level A) too?" Smoke-testing surfaced that our `wcag21aa`-exact filter underreports — Level A failures (`image-alt`, `label`) get tagged Section 508 only. Flagged for a follow-up single-purpose PR; current v0.3.5 ships with documented strict-AA behavior.

## Fixed

- N/A.

## Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/index.ts` | Replace M0 stub with real `parse → dispatch → I/O → exit`. |
| `packages/cli/src/args.ts` | New — pure arg parser (discriminated union). |
| `packages/cli/src/commands/audit.ts` | New — wires analyzer + renderer end-to-end. |
| `packages/cli/src/version.ts` | New — CLI version constant. |
| `packages/cli/tests/args.test.ts` | New — 16 parser tests. |
| `docs/99-open-questions.md` | New entry on Level A inclusion (surfaced by smoke). |
| `Versions/v0/v0.3.5/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **109/109 tests pass** (16 new).

**Live smoke test (the first for the full M4 pipeline):**

```
$ node packages/cli/dist/index.js audit https://example.com
# A11y Report — https://example.com

axe-core v4.11.4 · WCAG 2.1 AA + Section 508

**Clean — no violations.** 2 passes · 0 incomplete.
webspec audit: 0 violations · wrote to stdout

$ node packages/cli/dist/index.js audit file:///tmp/webspec-broken.html
# A11y Report — file:///tmp/webspec-broken.html

axe-core v4.11.4 · WCAG 2.1 AA + Section 508

**2 violations** · 2 passes · 0 incomplete.

## Critical (2)

| Rule | Sets | Selector | Issue |
|------|------|----------|-------|
| [image-alt](...) | Section 508 | `img` | ... |
| [label](...) | Section 508 | `input` | ... |
webspec audit: 2 violations · wrote to stdout
```

`--format json` and `--out <path>` paths also verified manually.
