# v0.3

## v0.3.9 — M5 Show Rules Checked (2026-05-11)

### Problem

A clean audit report ("0 violations") is not the same as "this page is accessible." Automated audits catch ~57% of WCAG issues at most — the rest needs manual + screen-reader testing. When a JAWS user or 508 reviewer surfaces something the audit missed, the question is always: *did the tool actually test for that?*

Pre-v0.3.9 there was no way to tell. The audit reported counts (`16 passes · 0 incomplete`) but never named the rules. So "did axe even check for skip links?" was unanswerable without leaving the tool and going to axe-core's source.

### Solution

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

### New

- `A11yRuleStatusSchema` + `RuleCheckSchema` in the contract (`packages/core/src/types/analysis.ts`).
- `rulesChecked` field on `A11yReport`.
- `collectRuleChecks` helper in `normalizeAxeResults`.
- `RulesCheckedPanels` React component in the extension popup — two collapsible `<details>` panels (Tested + Not applicable).
- 16 new tests across normalize (`rulesChecked` bucket flattening + dedup + sort) and renderer (split-subsection structure, reason column on Fail rows, comma-list inapplicable rendering, skip-empty-subsection cases).
- Sample fixture: one `inapplicable` rule added so all four status buckets are exercised.

### Changed

- `renderA11yReportMarkdown` always emits the rules-checked appendix when `rulesChecked` is non-empty, including on zero-violation reports. The early-return-on-clean was removed.
- Popup CSS gained a `.rules-checked` panel + colored `.rule-status` pills.

### Fixed

- N/A.

### Files Changed

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

### Verification

`make ci` green: lint clean, **126/126 tests pass** (16 new), library build clean, extension Vite bundle clean.

#### Live smoke

1. `make build && make ext-build` (or `make ci`).
2. `chrome://extensions` → reload the webspec card.
3. **CLI side:** `node packages/cli/dist/index.js audit https://example.com` — output now ends with a `## Rules checked (16)` table listing every rule axe ran. Useful to confirm CLI/popup parity.
4. **Extension side:** open `https://example.com`, click webspec, **Audit this tab**.
   - **Expected:** "Clean — N passes · M incomplete." summary, **Copy as Markdown** button, then an explainer line and two `<details>` panels: **Tested (M)** open by default with green Pass pills + (if any) red Fail pills with quoted reasons, and **Not applicable (K)** collapsed showing the comma-separated rule list when expanded.
5. Click **Copy as Markdown** → paste — output now includes the appendix split into `### Tested` and `### Not applicable` subsections; matches what the CLI emits.

## v0.3.8 — M5 Extension Audit Mode (2026-05-11)

### Problem

v0.3.7 stood up the extension scaffold (manifest, build pipeline, popup stub, content-script stub, service-worker stub) but the popup buttons were inert. The v1 mission needs the extension's **audit mode** working before it can claim to be a "shift-left companion" — a dev should be able to click the toolbar icon on their app, hit a button, and see WCAG/508 findings in the popup.

### Solution

End-to-end audit flow inside the extension. Popup ↔ content script messaging, axe-core injection, typed `A11yReport` rendered as React in the popup. Same `normalizeAxeResults` and same rule-set behavior as the CLI — Node and browser modes produce identical reports from identical pages.

- **Typed message protocol** (`src/shared/messages.ts`). Shared between popup and content script; both ends import the same types so the wire format can't drift. Request: `{ type: 'audit:request' }`. Response: `{ ok: true, results: AxeResults } | { ok: false, error: string }`.
- **Content script** (`src/content-script/index.ts`). Listens on `chrome.runtime.onMessage`. On audit request, runs `axe.run(document, { runOnly: { type: 'tag', values: [...] } })` against the page with the same five tags the Node mode uses. Returns raw `AxeResults`; normalization happens in the popup.
- **Popup** (`src/popup/App.tsx`). Status machine: `idle → running → (report | error)`. Audit handler queries active tab via `chrome.tabs.query`, sends the audit request, normalizes the response via `@webspec/core/browser`, renders. Surface-level error messages cover the cases the user can actually act on (non-http(s) tab, content script not loaded — telling them to reload the page).
- **`ReportView` component** (`src/popup/ReportView.tsx`). Severity-grouped findings as a React render driven by the typed `A11yReport`, not via the markdown renderer. Each finding shows: rule ID (linked to `helpUrl` when present), rolled-up rule sets ("WCAG 2.1 AA, Section 508"), selector in code, collapsed `failureSummary`. Severity headings use color cues (red/orange/amber/grey).
- **"Copy as Markdown" button.** Calls `renderA11yReportMarkdown` from core's browser entry — the popup and CLI emit byte-identical reports for the same findings. Brief "Copied!" / "Copy failed" state via `setTimeout`.
- **Popup width** grew from `min-width: 280px` to `min-width: 360px; max-width: 480px` so the report renders comfortably.

The `humanizeRuleSets` rollup is currently duplicated between core's markdown renderer and `ReportView`. Three-line function; inline comment notes the duplication. If a third consumer shows up (or a tag-set change reveals drift), extract to a shared helper.

### New

- `packages/chrome-extension/src/shared/messages.ts` — typed message protocol + `isAuditRequest` guard.
- `packages/chrome-extension/src/popup/ReportView.tsx` — React render for `A11yReport`.

### Changed

- `packages/chrome-extension/src/content-script/index.ts` — axe-core injection + `audit:request` listener. (Was: load marker only.)
- `packages/chrome-extension/src/popup/App.tsx` — full audit flow (status machine, active-tab messaging, error handling, copy-to-clipboard).
- `packages/chrome-extension/src/popup/popup.css` — popup sizing (360–480px), report layout (cards), severity-color headings, finding-item styles, error-message styling.

### Removed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/chrome-extension/src/shared/messages.ts` | New — typed message protocol. |
| `packages/chrome-extension/src/content-script/index.ts` | Replace load-marker stub with axe injection + audit-request listener. |
| `packages/chrome-extension/src/popup/App.tsx` | Replace stub with status-machine audit flow. |
| `packages/chrome-extension/src/popup/ReportView.tsx` | New — typed React report render. |
| `packages/chrome-extension/src/popup/popup.css` | Resize popup; add report + severity + finding + error styles. |
| `Versions/v0/v0.3.8/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **110/110 tests pass**, library build clean, extension Vite bundle clean.

Build output: content-script bundle is ~584 KB minified / 161 KB gzipped — bigger than the v0.3.7 scaffold because axe-core itself is the bulk. Within acceptable bounds for a content script; if it ever becomes a real constraint (slow injection on huge pages), dynamic-import via `chrome.scripting.executeScript` is the obvious next step.

#### Live smoke — exercise the audit flow

1. `make build && make ext-build` (or `make ci`).
2. Chrome → `chrome://extensions` → **Load unpacked** → `packages/chrome-extension/dist/`.
   - If the v0.3.7 extension is already installed, click the reload icon on the webspec card.
3. Navigate to `https://example.com` (a clean page).
4. Pin webspec → click the toolbar icon → click **Audit this tab**.
   - **Expected:** "Auditing…" briefly, then a "Clean — N passes · M incomplete." summary, no severity sections, a **Copy as Markdown** button.
5. Click **Copy as Markdown** → paste somewhere. Should match what `webspec audit https://example.com` outputs from the CLI.
6. Navigate to a deliberately-broken local page (use the same fixture from v0.3.5/v0.3.6 — `<img>` with no alt, `<input>` with no label, low-contrast button). Click **Audit this tab**.
   - **Expected:** 4 violations in Critical/Serious buckets, image-alt + label tagged "WCAG 2.1 AA, Section 508", color-contrast + html-has-lang tagged "WCAG 2.1 AA". Identical to the v0.3.6 CLI smoke output.
7. Try on a `chrome://settings` tab → click **Audit this tab**.
   - **Expected:** `"webspec only audits http(s) pages. Navigate to a regular web page and try again."` error.
8. Open a tab that existed *before* you reloaded the extension → click **Audit this tab** without reloading the tab.
   - **Expected:** `"Content script not loaded yet — reload the page and try again."` error.

If any step fails, that's a real bug — flag before the recorder PR goes on top.

## v0.3.7 — M5 Chrome Extension Scaffold (2026-05-11)

### Problem

M4 is done — the Node-mode audit pipeline runs end-to-end via `webspec audit <url>`. The v1 mission ("browser-based shift-left companion") needs the *browser* surface, M5, which is the v1 flagship. Before any feature work can land (audit injection, workflow recorder), the package needs a real Manifest V3 + Vite + React + TypeScript build pipeline. The `packages/chrome-extension` directory has been a one-line stub since M0; that stub can't host any of the M5 features.

### Solution

Stand up a working Manifest V3 extension that builds via Vite, loads unpacked in Chrome, and has the three entry points M5 needs (popup, content script, service worker) wired into a single build pipeline. Real features (audit, recorder) land in subsequent M5 PRs against this scaffold.

- **Bundler:** Vite 5 + `@crxjs/vite-plugin` 2 (the standard MV3 + Vite stack). Manifest defined in `manifest.config.ts` so entry-point paths can be referenced symbolically and the version is pulled from `package.json`.
- **Popup:** React 18 (StrictMode, createRoot). Stub UI shows the webspec brand, a one-line tagline, and two disabled `Audit / Record` buttons with tooltips noting which PR brings them online. Minimal CSS that respects light/dark via `color-scheme`.
- **Content script:** logs a load marker on `document_idle` for every http(s) page. Real injection logic (axe-core, then recorder event capture) lands in later PRs.
- **Service worker:** logs install reason on `chrome.runtime.onInstalled`. `chrome.webRequest` listener and message bus land with the recorder.
- **Browser entry on `@webspec/core`** — new export `@webspec/core/browser` re-exports only browser-safe modules: `A11yReport` types, `normalizeAxeResults`, `renderA11yReportMarkdown`, `renderA11yReportJson`, plus the LLM provider interface (no Bedrock adapter). The Node-only modules (`A11yAnalyzer`, `TestPlanAnalyzer`, `BedrockAdapter`) remain on the main entry. This makes the Node/browser boundary explicit so the Vite bundler can't accidentally pull in `puppeteer` or `ts-morph`.
- **Build pipeline:**
  - `packages/chrome-extension` switches from `tsc -b` to `vite build`. Vite handles bundling + TS transpilation; type-checking happens via the editor + (eventually) a `tsc --noEmit` pre-commit step.
  - Extension removed from root `tsconfig.json` project references (it now has `noEmit: true` + `composite: false`, incompatible with project references).
  - New `make ext-build` target → `pnpm --filter @webspec/chrome-extension build`.
  - `make ci` chain becomes `lint test build ext-build` so a CI run catches extension build breakage too (and `build` runs first to populate `@webspec/core/dist` which the extension imports from).
- **Build plan housekeeping:** M4 checkboxes in `docs/07-build-plan.md` ticked. The "browser-mode A11yAnalyzer" task is now explicitly folded into M5 (no callsite outside the extension); ships as M5's second PR.

### New

- `packages/chrome-extension/manifest.config.ts` — MV3 manifest as TypeScript.
- `packages/chrome-extension/vite.config.ts` — Vite + React + CRX plugin.
- `packages/chrome-extension/src/popup/{index.html, main.tsx, App.tsx, popup.css}` — React popup stub.
- `packages/chrome-extension/src/content-script/index.ts` — load-marker content script.
- `packages/chrome-extension/src/service-worker/index.ts` — install-logger service worker.
- `packages/core/src/browser.ts` — browser-safe re-exports.
- `ext-build` Makefile target.

### Changed

- `packages/core/package.json` — `exports` map adds `./browser` entry pointing to `dist/browser.js`.
- `packages/chrome-extension/package.json` — switched build to `vite build`; added React, axe-core, Vite, CRX, and `@types/{chrome, react, react-dom}` deps.
- `packages/chrome-extension/tsconfig.json` — `noEmit: true`, `composite: false`, `jsx: react-jsx`, `moduleResolution: Bundler`, types include `chrome` and `vite/client`.
- `tsconfig.json` (root) — dropped chrome-extension from project references (handled by Vite now).
- `Makefile` — `ci` now includes `build` + `ext-build`; new `ext-build` target.
- `docs/07-build-plan.md` — M4 checkboxes ticked with version pointers; M4 task "browser-mode analyzer" annotated as folded into M5.

### Removed

- `packages/chrome-extension/src/index.ts` — the M0 stub re-export is gone; entry points now live under `src/{popup, content-script, service-worker}/`.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/browser.ts` | New — browser-safe re-exports. |
| `packages/core/package.json` | Add `./browser` to exports map. |
| `packages/chrome-extension/package.json` | Switch build to Vite; add React + axe + CRX + types. |
| `packages/chrome-extension/tsconfig.json` | Browser/bundler-shaped TS config. |
| `packages/chrome-extension/manifest.config.ts` | New — MV3 manifest. |
| `packages/chrome-extension/vite.config.ts` | New — Vite + React + CRX. |
| `packages/chrome-extension/src/popup/` | New popup (HTML, React entry, App component, CSS). |
| `packages/chrome-extension/src/content-script/index.ts` | New — load marker. |
| `packages/chrome-extension/src/service-worker/index.ts` | New — install logger. |
| `packages/chrome-extension/src/index.ts` | Removed — replaced by per-entry-point modules. |
| `tsconfig.json` | Drop chrome-extension from project references. |
| `Makefile` | New `ext-build`; `ci` now includes `build` + `ext-build`. |
| `docs/07-build-plan.md` | Tick M4 checkboxes; annotate browser-mode analyzer as folded into M5. |
| `Versions/v0/v0.3.7/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **110/110 tests pass**, library build clean, extension Vite bundle clean (~143 KB JS, 46 KB gzipped). Build artifacts land in `packages/chrome-extension/dist/`.

#### Live smoke — load the extension in Chrome

1. From the repo root, run `make build && make ext-build` (or just `make ci`).
2. Open Chrome → `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** → select `packages/chrome-extension/dist/`.
5. **Expected:**
   - The extension shows up as `webspec` with the description above.
   - Its **Service Worker** link in `chrome://extensions` works; clicking it opens DevTools showing `[webspec] service worker installed: install`.
   - Pinning the extension and clicking the toolbar icon opens a popup that says `webspec` + the tagline + two disabled `Audit this tab` / `Record workflow` buttons.
   - Navigating to any http(s) page → opening DevTools → Console shows `[webspec] content script loaded: <url>`.

If any of those steps fails, that's a real bug — open an issue or flag it before the next M5 PR layers features on top.

## v0.3.6 — M4 Widen WCAG Tag Filter (2026-05-11)

### Problem

The v0.3.5 CLI smoke test surfaced a real reporting gap. We were running axe-core with `withTags(['wcag21aa', 'section508'])` and surfacing only those two tags on output. But axe tags rules by the specific WCAG criterion they cover — `image-alt` (1.1.1) is tagged `wcag2a`, not `wcag21aa`; same for `label`, `html-has-lang`, and other Level A rules. "WCAG 2.1 AA compliance" by W3C convention requires meeting Level A *and* Level AA criteria combined, so the strict `wcag21aa`-only filter was underreporting in two ways:

1. **Findings that were emitted** got mislabeled as Section 508 only when they were also WCAG violations (`image-alt`, `label` on the broken-HTML smoke).
2. **Findings that should have been emitted weren't surfaced at all** — axe wasn't even running rules tagged `wcag2a` because we never asked for them. Pre-v0.3.6 the same broken page returned 2 violations; post-v0.3.6 it returns 4.

Logged as an open question in v0.3.5; closing it here as a clean single-purpose PR before M5 starts.

### Solution

Widen the tag set everywhere it appears, end-to-end. Contract carries the fine-grained breakdown; renderer rolls it up for display.

- **Contract** (`packages/core/src/types/analysis.ts`): `A11yRuleTagSchema` enum widened to `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508']`. Downstream consumers see the granular tags on each `Finding.ruleSets`.
- **Normalizer** (`packages/core/src/analyze/a11y/normalize.ts`): `SURFACED_TAGS` matches the new enum; `A11yReport.ruleSet.tags` now lists all five surfaced tags.
- **Analyzer input** (`packages/core/src/analyze/a11y/analyzer.ts`): `DEFAULT_A11Y_TAGS` widened so axe-core actually runs the Level A rules. This is the load-bearing fix — without it, the additional findings simply don't exist.
- **Renderer display** (`packages/core/src/render/a11y/renderer.ts`): single `humanizeRuleSets` helper used by both the header (`axe-core vX · WCAG 2.1 AA + Section 508`) and the per-row Sets cell. Any `wcag*` tag in a finding → single "WCAG 2.1 AA" label; `section508` → "Section 508". No granular Level-A/Level-AA split — the question users actually ask is "am I WCAG 2.1 AA compliant?", and a single label answers it cleanly.

The change is invisible to downstream consumers reading `Finding.ruleSets` programmatically (the new tags are additive — pre-v0.3.6 callers checking `includes('wcag21aa')` keep working). The visible delta is: more findings, and Level-A findings carry a WCAG label.

### New

- One new renderer test (`treats Level A wcag tags as a WCAG label, not a Section-508-only finding`) that pins the v0.3.6 behavior so it can't regress silently.

### Changed

- `packages/core/src/types/analysis.ts` — `A11yRuleTagSchema` enum widened to 5 tags. Inline note on the rollup-for-display contract.
- `packages/core/src/analyze/a11y/normalize.ts` — `SURFACED_TAGS` widened.
- `packages/core/src/analyze/a11y/analyzer.ts` — `DEFAULT_A11Y_TAGS` widened. The comment now explains *why* (axe tags rules by specific criterion).
- `packages/core/src/render/a11y/renderer.ts` — `humanizeRuleSets` helper introduced, used by both the header and the Sets-cell renderer.
- `packages/core/tests/analyze/a11y/normalize.test.ts` — three assertions updated to reflect the new ruleSets shapes. Test names rewritten to describe the new behavior (one explicitly calls out "the v0.3.6 fix" so the trail is obvious).
- `packages/core/tests/render/a11y/renderer.test.ts` — old `renders ruleSets as humanized labels` test split into two: one for the rollup, one for the Level-A fix.
- `docs/99-open-questions.md` — v0.3.5 entry on Level A inclusion marked resolved with a pointer to this PR.

### Fixed

- A11y audits no longer underreport WCAG 2.1 AA violations. Same broken HTML now reports 4 violations instead of 2; Level-A failures (`image-alt`, `label`) carry the WCAG label they always should have had.

### Files Changed

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

### Verification

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

## v0.3.5 — M4 CLI webspec audit (2026-05-11)

### Problem

v0.3.3 + v0.3.4 shipped the Node-mode `A11yAnalyzer` and Markdown/JSON renderers, but only as library code. There's no user-facing surface yet — no way to run an audit from a terminal or wire one into CI. Without that, the M4 pipeline can't be smoke-tested end-to-end against a real page, and the v1 DoD line "thin CLI for CI integration: `webspec audit <url>`" can't be checked.

### Solution

Real `webspec audit` command, wired through the existing `packages/cli` stub. Hand-rolled arg parser (one subcommand, two flags — no library justified); pure parser + command split for testability.

- **`webspec audit <url>`** runs the M4 pipeline: launches headless Chromium via Puppeteer, injects axe-core, normalizes the result into `A11yReport`, renders to stdout (or `--out <path>`) as Markdown (default) or JSON.
- **Flags:** `--format md|json` (defaults to `md`), `--out <path>` (defaults to stdout). Unknown commands / flags / missing args produce a useful error message + help text on stderr.
- **Exit codes:** `0` clean run regardless of findings; `1` runtime error (puppeteer/network/FS); `2` bad arguments. No CI-gating on finding count yet — that needs a separate `--fail-on` flag and a deliberate design choice.
- **Stderr summary:** every successful run prints `webspec audit: N violations · wrote to <dest>` so CI logs are scannable without parsing the report.

**This is the first PR that smoke-tests M4 end-to-end against live pages.** Verified manually against `example.com` (clean), `github.com` (clean), `html5accessibility.com` (clean), and a deliberately broken local `file://` HTML page (2 critical findings, rendered correctly into the markdown table).

### New

- `packages/cli/src/args.ts` — pure arg parser returning a discriminated union (`audit | help | error`). 16 unit tests covering valid + error paths.
- `packages/cli/src/commands/audit.ts` — `runAudit(cmd)` wires `A11yAnalyzer` + renderer; writes to stdout or `--out` path.
- `packages/cli/src/version.ts` — `CLI_VERSION` constant stamped into `Analysis.meta.toolVersion`.
- `packages/cli/tests/args.test.ts` — 16 parser tests.

### Changed

- `packages/cli/src/index.ts` — replaced the M0 stub with a real entry point: parse → dispatch → I/O → exit. Help text reflects the actual current command set.
- `docs/99-open-questions.md` — new entry: "Should the a11y rule-set tag filter include `wcag2a` (Level A) too?" Smoke-testing surfaced that our `wcag21aa`-exact filter underreports — Level A failures (`image-alt`, `label`) get tagged Section 508 only. Flagged for a follow-up single-purpose PR; current v0.3.5 ships with documented strict-AA behavior.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/index.ts` | Replace M0 stub with real `parse → dispatch → I/O → exit`. |
| `packages/cli/src/args.ts` | New — pure arg parser (discriminated union). |
| `packages/cli/src/commands/audit.ts` | New — wires analyzer + renderer end-to-end. |
| `packages/cli/src/version.ts` | New — CLI version constant. |
| `packages/cli/tests/args.test.ts` | New — 16 parser tests. |
| `docs/99-open-questions.md` | New entry on Level A inclusion (surfaced by smoke). |
| `Versions/v0/v0.3.5/release-notes.md` | This file. |

### Verification

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

## v0.3.4 — M4 ReportRenderer (2026-05-11)

### Problem

v0.3.3 shipped the Node-mode `A11yAnalyzer` and produced an `A11yReport`, but consumers can't *do* anything with it yet. The build plan calls for "JSON and Markdown" output with "severity grouping, rule tag column, selector + fix-hint per finding." Both the CLI's `webspec audit` output and the Chrome extension's "Copy report" button need this renderer before they can ship.

### Solution

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

### New

- `packages/core/src/render/a11y/renderer.ts` — `renderA11yReportMarkdown` + `renderA11yReportJson`.
- `packages/core/tests/render/a11y/renderer.test.ts` — 18 tests. Pipes the existing axe fixture through `normalizeAxeResults` for realistic findings; inline minimal fixtures cover edge cases (zero findings, missing helpUrl, pipe escaping, multi-line `failureSummary`, singular "violation"); JSON round-trips through `A11yReportSchema`.

### Changed

- `packages/core/src/index.ts` — exports both renderers, with the same browser-safe-renderer convention used for `renderTestPlan`.

### Fixed

- N/A.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/render/a11y/renderer.ts` | New — Markdown + JSON renderers. |
| `packages/core/src/index.ts` | Export the renderers. |
| `packages/core/tests/render/a11y/renderer.test.ts` | New — 18 tests (sample-fixture + edge cases + JSON round-trip). |
| `Versions/v0/v0.3.4/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **93/93 tests pass** (18 new). The renderer is exercised end-to-end against the same axe fixture that backs the normalize tests, so any regression in either step shows up here too.

Live smoke deferred to the next M4 PR (`webspec audit <url>` CLI), which will wire the analyzer + renderer behind a `--format md|json` flag.

## v0.3.3 — M4 Node-mode A11yAnalyzer (2026-05-11)

### Problem

M4 is the first milestone on the post-pivot v1 active path (M4 → M5 → M6). It needs to produce a normalized `A11yReport` from a live page against the WCAG 2.1 AA + Section 508 rule sets, and the same normalization has to work from both Node mode (CLI) and browser mode (Chrome extension, M5). Without the Node-mode entry point, there's no way to run an audit from CI or to verify parity between the CLI and the Chrome extension later.

### Solution

Ship the Node-mode `A11yAnalyzer` (`packages/core/src/analyze/a11y/analyzer.ts`) plus a pure normalization function (`packages/core/src/analyze/a11y/normalize.ts`).

- **`A11yAnalyzer`** drives Puppeteer + `@axe-core/puppeteer`. Two entry points: `analyzeUrl({ url, ... })` manages its own headless Chromium lifecycle; `analyzePage({ page, ref, ... })` lets a caller bring its own page (handy for the M5 verification harness later). Defaults to tags `['wcag21aa', 'section508']`.
- **`normalizeAxeResults`** is the pure step: `AxeResults → A11yReport`. Browser-safe — imports only `axe-core` types and the contract schema, no Node deps. M5's content script will call the same function with its own `AxeResults` so audit findings stay identical across surfaces.
- **Severity fallback:** axe's `impact: null` collapses to `'moderate'` (axe's documented default). The contract requires a concrete severity; this avoids spurious validation failures.
- **Tag filtering:** axe results carry many tags (wcag2a, best-practice, etc.); we surface only `wcag21aa` + `section508` on each `Finding.ruleSets`. A finding with neither surfaced tag still emits (with `ruleSets: []`) so report consumers see everything axe flagged at the chosen severity, but the rule-tag column accurately reflects which compliance regime called it out.
- **One finding per node**, not one per rule. Matches the way axe reports its data (a single `image-alt` violation can hit multiple `<img>` elements; each gets its own row in the rendered report).

The `ReportRenderer`, CLI `webspec audit` command, and Chrome-extension browser-mode analyzer are the remaining M4 tasks and land in subsequent patch versions.

### New

- `packages/core/src/analyze/a11y/normalize.ts` — pure `normalizeAxeResults(axeResults, target) → A11yReport`, zod-validated at return.
- `packages/core/src/analyze/a11y/analyzer.ts` — `A11yAnalyzer` class with `analyzeUrl` and `analyzePage` entry points; wraps the normalized report in the `Analysis` envelope (kind: `'a11yReport'`).
- `packages/core/tests/analyze/a11y/normalize.test.ts` — 14 fixture-based tests covering severity mapping, tag filtering, target selector formatting, helpUrl wiring, and counts. No browser launched.
- `packages/core/tests/fixtures/a11y/sample-axe-results.ts` — hand-crafted `AxeResults` fixture covering both-tagged, wcag-only, 508-only, and untagged violations.
- New deps in `packages/core`: `@axe-core/puppeteer ^4.10.2`, `axe-core ^4.10.3`, `puppeteer ^24.0.0`.

### Changed

- `packages/core/src/index.ts` — exports `A11yAnalyzer`, `DEFAULT_A11Y_TAGS`, `normalizeAxeResults`, plus the option/target types. Inline note that `analyzer.js` is Node-only and browser bundles must exclude it (same convention used for `bedrock.js` and `test-plan/parser.js`).

### Fixed

- N/A — first M4 PR; no prior behavior to correct.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/package.json` | Add `@axe-core/puppeteer`, `axe-core`, `puppeteer` deps. |
| `packages/core/src/analyze/a11y/normalize.ts` | New — pure `AxeResults → A11yReport` normalization. |
| `packages/core/src/analyze/a11y/analyzer.ts` | New — Node-mode analyzer driving Puppeteer + axe. |
| `packages/core/src/index.ts` | Export the analyzer + normalize function. |
| `packages/core/tests/analyze/a11y/normalize.test.ts` | New — 14 tests for the normalization contract. |
| `packages/core/tests/fixtures/a11y/sample-axe-results.ts` | New — hand-crafted AxeResults fixture. |
| `Versions/v0/v0.3.3/release-notes.md` | This file. |

### Verification

`make ci` green: lint clean, **75/75 tests pass** (14 new). The fixture-based tests don't launch a browser, so CI stays fast.

Live smoke test (manual, not in CI): once the M4 CLI surface (`webspec audit <url>`) lands in the next patch, `webspec audit https://example.com` will exercise the full Puppeteer path end-to-end. For now, `A11yAnalyzer` can be driven from a Node REPL or ad-hoc script.

## v0.3.2 — Pivot To Shift Left (2026-05-08)

### Problem

The original v1 scope had three coequal capabilities — unit-test gen from Angular source files, a11y audit, and recording → Playwright — exposed across three coequal surfaces (CLI, VS Code, Chrome extension). After working on it, the underlying mission clarified: **shift left and fail faster on web app development.** A developer walks through their feature in Chrome, the tool catches problems before formal testing.

That mission doesn't fit the original scope cleanly:

- **Unit-test gen from `.component.ts` source** is productivity tooling, not a shift-left signal. A dev typing `webspec gen foo.component.ts` to get a Jest spec is convenient, but it doesn't catch issues earlier than they otherwise would. It's also the only framework-tied piece in the whole tool — Angular-specific by necessity, since unit tests of a component need its API.
- **VS Code as a coequal surface** adds friction without adding shift-left value when the dev is already in Chrome driving their app.
- **"Record → Playwright spec"** as currently planned is a 1:1 translation with optional LLM polish (test names + assertions). What actually serves shift-left is **LLM amplification** — the recorder captures the happy path; the LLM proposes negative scenarios (empty input, invalid input, error states, edge variants) the dev didn't think to try.

These weren't broken decisions, but they spread effort across surfaces and capabilities that don't all earn their seat in v1.

### Solution

Doc-only pivot. Reshape v1 around the shift-left mission:

- **v1 active path is now M4 + M5 + M6**, all browser-first, all framework-agnostic.
  - M4 — A11y analyzer + report renderer (Chrome ext + thin CLI).
  - M5 — Chrome extension (the v1 primary surface): audit + workflow recorder.
  - M6 — Recording → Playwright `.spec.ts` with **positive AND negative scenarios** (LLM-amplified). The spec contains the recorded happy path plus LLM-generated negative variants in additional `test()` blocks.
- **v1 ships a thin CLI** for CI integration (`webspec audit`, `webspec record-to-spec`) — not a unified CLI surface.
- **M2 stays as foundation** (the Angular `TestPlan` analyzer + Jest renderer shipped in v0.3.0). TestPlan stays unit-test-shaped; M6 introduces a separate e2e-shaped intermediate.
- **M6 IR resolved (Path C):** LLM emits a typed structured `AmplifiedRecording` (`scenarios[]` with typed actions + assertions); a deterministic renderer formats it into Playwright source. Same architectural pattern as M2 — LLM never writes shipped code directly. Beats both "reuse TestPlan" (category mismatch) and "LLM emits Playwright source" (loses validation gate).
- **Post-v1 unit-test-gen reactivation:** the path returns as a save-time editor watcher (which IS shift-left), not a manual CLI. M2 foundation stays in the codebase ready to pick up.
- **Secondary success metric** added to `mission.md`: save time, stop defects from reaching the test phase. Sharper framing of shift-left + fail-fast.
- **Deferred from v1 active path:**
  - M3 (CLI for unit-test gen). The `webspec gen` and `webspec init` commands go away in v1; reactivate post-v1 if there's demand.
  - M7 (VS Code extension). Browser-first means browser-only in v1.
  - M8 (second LLM adapter + parity test). The seam is proven structurally; second adapter is post-v1 unless customer procurement forces it sooner.

No code changes. M0–M2 deliverables (foundations, contract artifact, LLM seam, TestPlan analyzer + Jest renderer) all stay in the codebase exactly as shipped. The pivot is purely about what we *extend* next.

### New

- New v1 Definition of Done in `docs/07-build-plan.md` reflecting the shift-left mission.
- New open questions in `docs/99-open-questions.md`:
  - Does M6 amplification route through `TestPlan` or render Playwright directly from `WorkflowRecording`?
  - Does unit-test-from-source return post-v1 as a save-time watcher?
  - Confirmed: v1 CLI surface area is smaller than originally scoped.

### Changed

- `docs/mission.md` — full rewrite. Mission leads with shift-left + fail-fast. Tool reframed as a browser-based dev-time companion. Three v1 things: workflow recorder, recording → Playwright with positive/negative scenarios, 508/WCAG audit. Drops "Cut the time Bellese teams spend writing Angular unit-test boilerplate" framing.
- `docs/07-build-plan.md` — v1 DoD rewritten. M2 marked as foundation/deferred. M3 marked as deferred from v1. M6 reshaped to make the LLM-amplification pass produce positive + negative scenarios as multiple `test()` blocks. M7 + M8 deferred from v1.
- `docs/00-overview.md` — "What this tool does" + "v1 scope" sections rewritten. Three capabilities now framed as "all on a live page" with shift-left as the binding mission. Diagram updated to reflect Chrome-as-primary + thin CLI.
- `docs/01-architecture.md` — surfaces section reordered: Chrome ext now listed first as v1 primary; CLI v1 surface area noted as reduced; VS Code marked as deferred.
- `docs/02-contract-spec.md` — TestPlan variant section gains a note that the IR is reusable for M6 amplification (positive + negative scenarios as `cases[]`); `framework` widening (`'jest'` → `'jest' | 'playwright'`) flagged as a Bucket A (additive) change.
- `CLAUDE.md` — top-line description rewritten to lead with the browser-based shift-left framing. "Current state" section updated to reflect M0–M2 shipped + the pivot.

### Fixed

- v1 scope no longer over-promises a unified CLI + VS Code + Chrome surface area when the mission only requires the Chrome surface to ship.
- `mission.md` no longer leads with "writing Angular unit-test boilerplate" — that framing predated the shift-left clarification.

### Files Changed

| File | Change |
|------|--------|
| `CLAUDE.md` | Top-line + "Current state" rewritten for the pivot. |
| `docs/mission.md` | Full rewrite — shift-left + fail-fast, browser-first, three v1 capabilities. |
| `docs/00-overview.md` | "What this tool does" + "v1 scope" + diagram + "Reading order" + "North-star" updated. |
| `docs/01-architecture.md` | Surfaces section reordered + scope notes. |
| `docs/02-contract-spec.md` | TestPlan variant — note on M6 reuse. |
| `docs/07-build-plan.md` | v1 DoD + M2/M3/M6/M7/M8 statuses reshaped for the pivot. |
| `docs/99-open-questions.md` | 3 new entries: M6 IR path, unit-test-gen reactivation post-v1, CLI surface area. |
| `Versions/v0/v0.3.2/release-notes.md` | This file. |

### Verification

No code changed. Existing tests still pass (no need to re-run; nothing in `packages/` was touched).

`make ci` will be re-run by Rob before merge as a sanity check.

## v0.3.1 — Rename To Webspec (2026-05-08)

### Problem

The tool's name `bellese-test` and npm scope `@bellese/test-*` tied the project to one company. The product is a frontend testing toolkit (unit tests + Section 508 / WCAG audits + Playwright e2e from recordings) — none of which is Bellese-specific. A company-locked name made the project look narrower than it is and would have grown more expensive to fix with every PR, doc, and external reference that landed under the old identity.

### Solution

Renamed the tool to **webspec**. "spec" elegantly covers all three outputs (Jest specs, Playwright specs, a11y findings) and the name says nothing about what framework the page is built with. Did the rename now — at v0.3.1, 5 PRs in — because the cost grows monotonically with time and external traffic, and it's near-zero today.

Mechanical changes:

- CLI bin: `bellese-test` → `webspec`
- npm scope: `@bellese/test-*` → `@webspec/*` (drops the redundant `test-` prefix; the scope itself now implies the project)
  - `@bellese/test-core` → `@webspec/core`
  - `@bellese/test-cli` → `@webspec/cli`
  - `@bellese/test-config` → `@webspec/config`
  - `@bellese/test-chrome-extension` → `@webspec/chrome-extension`
  - `@bellese/test-vscode-extension` → `@webspec/vscode-extension`
- Config filename (planned, not yet implemented): `bellese-test.config.json` → `webspec.config.json`
- Cache directory reference (planned): `.bellese-test/cache/` → `.webspec/cache/`
- Docker image tag: `bellese/angular-automated-testing:dev` → `webspec/angular-automated-testing:dev`

Prose changes where company-specific framing conflicted with the rename:

- `CLAUDE.md` top-line description: rebranded to lead with **webspec** and dropped "reusable across Bellese projects" framing.
- `docs/mission.md`: "Drop into any Bellese Angular repo" → "Drop into any Angular repo." Other "Bellese" references that describe origin/audience (built at Bellese, used by Bellese teams, federal-customer context) are factually accurate and were preserved.

Untouched:

- `Versions/v*/release-notes.md` — historical artifacts of what shipped under the old name; rewriting them would be dishonest.
- Repo name `angular-automated-testing` — to be renamed on GitHub as part of this version (manual step Rob owns). The repo name follows the project, not the other way around. GitHub auto-redirects old URLs so existing links don't rot.
- `infra/terraform/` — no infra under the old name was deployed.

### New

- `webspec` CLI bin (replaces the `bellese-test` stub).

### Changed

- All package manifests, src headers, `PACKAGE_NAME` constants, CLI output strings, Dockerfile labels, Makefile docker tag, and docs (`00-overview`, `01-architecture`, `02-contract-spec`, `07-build-plan`, `99-open-questions`, `mission`) reference the new identity.
- `pnpm-lock.yaml` regenerated under the new scope.

### Fixed

- Project name no longer over-claims a company-specific scope.

### Files Changed

| File | Change |
|------|--------|
| `CLAUDE.md` | Top-line description rebranded to webspec; drop "Bellese projects" framing. |
| `Dockerfile` | Comment + LABEL description updated; smoke-test reference uses `webspec --help`. |
| `Makefile` | Docker image tag `bellese/angular-automated-testing:dev` → `webspec/angular-automated-testing:dev`. |
| `docs/00-overview.md` | `bellese-test` → `webspec` (CLI commands + config filename). |
| `docs/01-architecture.md` | Config-filename + diagram references. |
| `docs/02-contract-spec.md` | `@bellese/test-core` and `@bellese/test-config` references. |
| `docs/07-build-plan.md` | All `bellese-test` references in v1 DoD + M3/M4 task lists. |
| `docs/99-open-questions.md` | CLI references in M3 e2e trigger and recording-transport notes; cache-dir example. |
| `docs/mission.md` | Tool/config name; "any Bellese Angular repo" → "any Angular repo." |
| `packages/cli/package.json` | `name`, `description`, `bin`, deps under `@webspec/*`. |
| `packages/cli/src/index.ts` | All CLI output strings reference `webspec`. |
| `packages/core/package.json` | `name`, `description`. |
| `packages/core/src/index.ts` | Header comment + `PACKAGE_NAME` constant. |
| `packages/core/src/llm/bedrock.ts` | Header comment. |
| `packages/core/src/types/analysis.ts` | Comment about `ResolvedConfig` ownership. |
| `packages/config/package.json` | `name`, `description`. |
| `packages/config/src/index.ts` | Header comment + `PACKAGE_NAME` constant. |
| `packages/chrome-extension/package.json` | `name`, deps. |
| `packages/chrome-extension/src/index.ts` | Header comment. |
| `packages/vscode-extension/package.json` | `name`, `displayName`, deps. |
| `packages/vscode-extension/src/index.ts` | Header comment. |
| `pnpm-lock.yaml` | Regenerated under `@webspec/*` scope. |

### Verification

- `make build` — green (`tsc -b` across all 5 workspace packages).
- `make ci` — green (eslint clean; vitest 61/61 tests pass: parser, renderer, bedrock adapter, integration).
- No `bellese-test` or `@bellese/test-` references remain anywhere outside `Versions/` (historical).

## v0.3.0 — Test generator (Phase 1 + Phase 2 for tests) (2026-05-07)

### Problem

M1 locked the contract artifact and the LLM seam. M2 is the first feature milestone — the source-driven Jest test generator that the CLI (M3) and VS Code extension (M7) both depend on. Without it, the rest of the build plan has no concrete capability to demo against. The architecturally interesting question for M2: how to keep the LLM from fabricating a different component surface than what's actually in source. The answer baked into M1's contract test pattern carries forward: parse the surface deterministically, hand the LLM ONLY the cases it needs to write, validate against zod, never trust generated structure.

### Solution

Five pieces of code, three fixture components, three hand-authored TestPlans, and a two-test-file integration suite:

1. **`packages/core/src/analyze/test-plan/parser.ts`** — `ts-morph`-based extractor. Pure function `parseComponentSurface(filePath)` (plus a `parseComponentSurfaceFromText` variant for in-memory tests). Returns `ParsedComponentSurface` carrying `unit`, `surface`, and `styleHints` matching the M1 `TestPlan` shape minus `cases[]`.
2. **`packages/core/src/analyze/test-plan/prompt.ts`** — long stable system prompt (cacheable via the adapter's `cache_control`) describing the assistant's role, Angular Jest conventions, signal-API guidance, and the `arrange`/`act`/`assert` fragment contract. Per-component user prompt formats the parsed surface as a structured brief.
3. **`packages/core/src/analyze/test-plan/analyzer.ts`** — `TestPlanAnalyzer` class taking an `LLMProvider`. The LLM returns ONLY `cases[]` (validated against `z.object({cases: z.array(TestCaseSchema)})`); the analyzer assembles the full `TestPlan` locally. Returns the full `Analysis` envelope.
4. **`packages/core/src/render/test/renderer.ts`** — pure function `renderTestPlan(plan): string`. Deterministic, goldenable, browser-safe (no Node `path`). Emits `import { ComponentFixture, TestBed }`, the standalone `imports: [Component]` pattern, standard provider mocks for `HttpClient` (→ `provideHttpClient() + provideHttpClientTesting()`) and `Router` (→ `provideRouter([])`), generic `{ provide: X, useValue: {} }` stubs for unrecognized deps, and `it()` blocks with arrange/act/assert comments.
5. **Tests:** 16 parser unit tests (decorator + signal forms, lifecycle, deps), 15 renderer golden tests (incl. an inline-snapshot full-layout assertion), 18 integration tests against three fixture components.

The full live-Bedrock + Jest-against-real-Angular-app verification (the literal v0.3.0 done-when criterion from the build plan) is **deferred to M3** — see Changed below. M3's CLI work needs the same Angular fixture app for its own e2e, so building it now and again would be duplicate effort.

### New

- **TestPlanAnalyzer pipeline** (`packages/core/src/analyze/test-plan/`):
  - `parser.ts` — extracts `name` (class name), `kind: 'component'`, `inputs` (`@Input` + `@Input({required:true})` + `input()` + `input.required<T>()`), `outputs` (`@Output` w/ `EventEmitter<T>` unwrapped, `output<T>()`), `publicMethods` (filtered to skip private/protected/lifecycle), `lifecycle` (the 8 standard hooks), `deps` (`inject()` field initializers + constructor parameters), `styleHints` (`useStandalone`, `useSignals`, `useInject`). Also exports `parseComponentSurfaceFromText(name, source)` for in-memory testing.
  - `prompt.ts` — `SYSTEM_PROMPT` constant + `formatUserPrompt(parsed)`. The system prompt forbids private-member assertions, `fdescribe`/`fit`, mocking standard Angular machinery, and `console.log` in test bodies.
  - `analyzer.ts` — `TestPlanAnalyzer { constructor(llm: LLMProvider); analyze(opts): Promise<Analysis> }`. Throws `NoComponentFoundError` if the file has no `@Component` class.
- **TestRenderer** (`packages/core/src/render/test/renderer.ts`):
  - `renderTestPlan(plan: TestPlan): string`. Browser-safe (no `path` import; uses string ops for filename → import path conversion).
  - Recognized standard deps mapped to standard providers: `HttpClient` and `Router`. Unrecognized deps fall through to a `{ provide: X, useValue: {} }` stub.
  - Per-case extra `imports[]` are merged into the `@angular/core/testing` import line (covers `By`, `DebugElement`, etc.).
- **Three fixture components** (`packages/core/tests/fixtures/components/`):
  - `greeter.component.ts` — presentational, decorator-based `@Input`/`@Output`, no deps.
  - `user-list.component.ts` — service-injecting via constructor DI; `HttpClient`, `Router`, and a custom `UserService` (the latter exercises the generic-stub fallback).
  - `signal-counter.component.ts` — modern signal API: `input()`, `input.required<T>()`, `output<T>()`, `inject()`, `signal()`, `computed()`.
- **Three hand-authored TestPlans** (`packages/core/tests/fixtures/test-plans/*.json`) snapshotting what a competent LLM would emit for each fixture. Used by the integration test to verify renderer output without hitting a live LLM.
- **Tests (61 total, +43 new in M2):**
  - `tests/analyze/test-plan/parser.test.ts` — 16 unit tests.
  - `tests/render/test/renderer.test.ts` — 15 golden tests including a full inline snapshot.
  - `tests/integration/test-plan.integration.test.ts` — 18 tests pinning the parser → renderer round-trip against the three fixture components. Asserts: parser surface aligns with hand-authored plan surface (names + signal flags + lifecycle + dep names), renderer output contains expected idioms (provider mocks, signal-aware `setInput`, `it()` count = case count).
- **Public API additions** in `packages/core/src/index.ts`: `TestPlanAnalyzer`, `NoComponentFoundError`, `AnalyzeOptions`, `parseComponentSurface`, `parseComponentSurfaceFromText`, `ParsedComponentSurface`, `SYSTEM_PROMPT`, `formatUserPrompt`, `renderTestPlan`. Documented as Node-only (excludes from browser bundles via `core/src/analyze/test-plan/parser.ts` importing `ts-morph`).
- **Dep added:** `ts-morph` for Angular source parsing.

### Changed

- **`docs/07-build-plan.md` M2 status:** all task boxes ticked. Done-when explicitly notes that live-Jest-against-real-Angular verification is deferred to M3.
- **`docs/07-build-plan.md` M3 scope:** added a task to bootstrap the Angular 20 fixture app + run the rendered specs through Jest. M3 done-when extended to include "`npx jest` against the rendered specs returns green." Closes the deferred M2 e2e verification while doing M3's CLI integration anyway.
- **`docs/99-open-questions.md`:** new entry "M2 e2e: live Jest verification against a sample Angular 20 app" tracking the deferral with M3 as the resolution trigger.

### Fixed

- (n/a)

### Files Changed

| File | Change |
| ---- | ------ |
| `packages/core/package.json` | Changed — added `ts-morph` dependency |
| `packages/core/src/index.ts` | Changed — exports for analyzer, parser, prompt helpers, renderer |
| `packages/core/src/analyze/test-plan/parser.ts` | New — ts-morph-based component surface extractor |
| `packages/core/src/analyze/test-plan/prompt.ts` | New — system + user prompt construction |
| `packages/core/src/analyze/test-plan/analyzer.ts` | New — `TestPlanAnalyzer` end-to-end |
| `packages/core/src/render/test/renderer.ts` | New — `TestPlan` → Jest `.spec.ts` source |
| `packages/core/tests/analyze/test-plan/parser.test.ts` | New — 16 parser unit tests |
| `packages/core/tests/render/test/renderer.test.ts` | New — 15 renderer golden tests |
| `packages/core/tests/integration/test-plan.integration.test.ts` | New — 18 parser+renderer round-trip tests against fixtures |
| `packages/core/tests/fixtures/components/greeter.component.ts` | New — presentational fixture |
| `packages/core/tests/fixtures/components/user-list.component.ts` | New — service-injecting fixture |
| `packages/core/tests/fixtures/components/signal-counter.component.ts` | New — signal-API fixture |
| `packages/core/tests/fixtures/test-plans/greeter.json` | New — hand-authored plan |
| `packages/core/tests/fixtures/test-plans/user-list.json` | New — hand-authored plan |
| `packages/core/tests/fixtures/test-plans/signal-counter.json` | New — hand-authored plan |
| `docs/07-build-plan.md` | Changed — M2 ticked + done-when narrowed; M3 scope expanded |
| `docs/99-open-questions.md` | Changed — added "M2 e2e: live Jest verification" entry |
| `pnpm-lock.yaml` | Changed — `ts-morph` resolution |
| `Versions/v0/v0.3.0/release-notes.md` | New — this file |

