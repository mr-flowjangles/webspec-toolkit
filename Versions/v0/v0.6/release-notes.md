# v0.6

## v0.6.2 — M6 Renderer Design (2026-05-12)

### Problem

M5 closed at v0.6.0 and the recorder gained option capture at v0.6.1, so the upstream artifact is settled. But the M6 implementation can't responsibly start until the design questions the build plan left vague are answered: which Playwright actions does the IR support, which assertions, how does each `navigate.reason` render, what's the integration-test target, and what does the renderer do with ambiguous selectors. Without those locked, v0.7.0 would land code that contradicts decisions we haven't actually made.

Per the project working norm ("design before code, recorded in `docs/`, then implemented"), the design needs to ship as its own version before the implementation does.

### Solution

A single new design doc, `docs/06-renderer.md`, that records the five M6 decisions reached in the v0.6.2 planning walk-through. No code. The next version (v0.7.0) implements the deterministic pass against this doc.

The five locked decisions:

1. **Action set.** Six IR actions (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`) plus two derived from `change` events (`selectOption`, `check`/`uncheck`).
2. **Assertion set.** Seven matchers (`visible`, `hidden`, `text`, `url`, `count`, `value`, `checked`).
3. **`navigate.reason` mapping.** `navigate` → `waitForURL`; `reload` → `reload()`; `history`/`hash` → `expect(page).toHaveURL(url)` assertion. The asymmetry (some reasons emit actions, others emit assertions) is deliberate — there's no Playwright action to "do" a hash change.
4. **Integration test target.** Hermetic local fixtures under `tests/fixtures/playwright-target/`, loaded via `file://`. No hosted-site dependency in CI; real-world sites stay verified through the v0.6.0 three-site manual pass.
5. **Ambiguous selectors.** Render every event with `selector.preferred` as captured. No skips, no warning comments. Selector quality is fixed upstream in `selectors.ts`.

The doc also sketches the `AmplifiedRecording` IR shape (typed `actions[]` and `assertions[]`) and lists v1 non-goals (visual diffs, network mocks, multi-select, extension playback, Cypress/Jasmine renderers).

### New

- `docs/06-renderer.md` — the M6 E2E renderer design doc. Covers the five locked decisions, the IR sketch, the two-pass output examples (deterministic-only and amplified), and the v0.7.0 → v1.0.0 implementation sequence.

### Changed

- `docs/07-build-plan.md` — M6 section header now points at `docs/06-renderer.md` for the design contract.

### Files Changed

| File | Change |
|------|--------|
| `docs/06-renderer.md` | New — M6 renderer design doc. |
| `docs/07-build-plan.md` | Add "Design: see `docs/06-renderer.md`" pointer in the M6 header. |
| `Versions/v0/v0.6.2/release-notes.md` | This file. |

### Verification

Docs-only PR — no code changes. `pnpm -w test` still green (147/147 unchanged). The verification that matters is reading the doc and confirming it captures everything the walk-through landed on. v0.7.0 will be the first version that depends on `06-renderer.md` being right.

### What's next

v0.7.0 implements the deterministic pass exactly as specified in `06-renderer.md`:

1. `packages/core/src/render/e2e/` — pure `WorkflowRecording → string` renderer that maps each `RecordedEvent` to the Playwright primitive named in the action-set table.
2. `packages/cli/src/commands/record-to-spec.ts` — wires `webspec record-to-spec <recording.json>` to the renderer, writes `recording.spec.ts` next to the input.
3. Golden tests against hand-written `WorkflowRecording` fixtures (no LLM in the loop).
4. The local fixture (`tests/fixtures/playwright-target/`) stays minimal at v0.7.0; expands as v0.7.3 needs more coverage for the integration test.

## v0.6.1 — Capture Select Options (2026-05-12)

### Problem

The recorder captured `<select>` interactions as a `change` event with only the chosen `value`. The full option set the user was presented with — every `<option>` element with its value and label — was thrown away. That's fine for the deterministic M6 pass (Playwright's `selectOption(value)` just needs the value), but the M6 LLM amplifier needs the unchosen options to generate negative scenarios ("what if the user picked Mexico instead of Canada?"). Without the option set in the recording, the amplifier has no anchor for those scenarios beyond hallucinating one.

The first cut of the option-capture also surfaced a parallel issue: a single user selection on a native `<select>` was producing three events in the recording (pre-click → change → post-click), because the v0.5.1 dedup rule that drops `click` events around `change` only covered checkbox/radio. Three events per selection is noisy enough that a renderer would have to filter clicks itself.

### Solution

**Option capture.** The `change` event in `RecordedEvent` gains an optional `options: { value, label }[]` field, populated only when the target is a `<select>`. The content script reads `select.options` at the moment of change and stores each `<option>`'s `value` plus trimmed `textContent` as the label. Single-select only for v0.6.1 — `<select multiple>` is rare in workflow recordings and adds a renderer surface (array of values) better handled when the renderer actually needs it. Optgroups are flattened; disabled options are still captured (they're part of the visible UI even when unselectable).

**Select-dedup symmetry.** The dedup rule already in `handleChange` for checkbox/radio (drop the preceding click on the same selector) now applies to `<select>` too. And `handleClick` gained the inverse case: a native `<select>` fires its `change` event *before* the `click` finishes bubbling from the chosen option, so the click arrives *after* the change. Same physical action, two events — we drop the trailing click. Net result: one `change` event per selection. The dedup rules in the recorder doc comment now cover both orderings.

### New

- `options?: { value: string; label: string }[]` field on the `change` variant of `RecordedEventSchema` in `packages/core/src/types/analysis.ts`.
- `optionsFor(select)` helper in `packages/chrome-extension/src/content-script/index.ts` — maps a live `HTMLSelectElement` to the typed options array.

### Changed

- `packages/chrome-extension/src/content-script/index.ts` — `handleChange` populates `options` for `<select>` targets and applies the click-before-change dedup. `handleClick` drops a click on a `<select>` if the previous buffered event is a `change` on the same selector. Module docstring extended to cover the trailing-click case.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/analysis.ts` | Add optional `options` array to the `change` event schema. |
| `packages/chrome-extension/src/content-script/index.ts` | Capture `<select>` options at change time. Extend dedup to handle both pre- and post-change clicks on selects. |
| `Versions/v0/v0.6.1/release-notes.md` | This file. |

### Verification

`pnpm -w test` green: 147/147 tests still pass (schema change is additive — `options` is optional). Type-check clean. Vite bundle clean.

#### Live smoke

1. `pnpm build` in `packages/chrome-extension`.
2. Refresh the webspec card at `chrome://extensions/` (no manifest change).
3. Serve a select fixture: `python3 -m http.server 8765` from `/tmp` after `cat > /tmp/select-test.html <<'EOF' ... EOF` with a `<select id="country">` containing US/CA/MX options.
4. Open `http://localhost:8765/select-test.html`.
5. Click **Record workflow** → pick three different countries from the dropdown → Stop.
6. Open the downloaded JSON. Three `change` events, each with `value` set to the chosen value and `options` listing all three. **No `click` events.**

Sample (recorded during v0.6.1 verification):

```json
{ "kind": "change", "value": "ca", "options": [{"value":"us","label":"United States"}, {"value":"ca","label":"Canada"}, {"value":"mx","label":"Mexico"}] }
{ "kind": "change", "value": "mx", "options": [{...same three...}] }
{ "kind": "change", "value": "us", "options": [{...same three...}] }
```

### What's next

M6 starts. The IR action set is locked (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`); the assertion set, `navigate.reason` mapping, sample-app fixture, and ambiguous-selector policy are the remaining open questions, walked through one at a time before any v0.7.0 code.

## v0.6.0 — Verify Recorder And Audit Parity (2026-05-11)

### Problem

M5 had every checkbox ticked except the last one: the "verify on three deployed sites + audit parity with the CLI" gate that closes the milestone. Before declaring M5 done and starting M6 (renderer), we needed evidence that:

1. The recorder produces sensible recordings on real public sites, not just the TodoMVC playground.
2. The CLI's `webspec audit` and the extension's "Audit this tab" find the same kinds of issues on the same URL — the audit pipeline is honest across both surfaces.

While doing the audit-parity check we noticed a small metadata bug in the CLI: the `Analysis.meta.config` claimed `tags: ['wcag21aa', 'section508']` but the analyzer was actually running the wider `DEFAULT_A11Y_TAGS` set (including `wcag2a`, `wcag2aa`, `wcag21a`, and `best-practice`). Reports were truthful about findings but lied about the configuration that produced them — a divergence between CLI metadata and reality.

### Solution

This is a minor bump because it closes a milestone, not because the diff is large. Two pieces:

**Audit-parity fix.** The CLI now passes `[...DEFAULT_A11Y_TAGS]` for `Analysis.meta.config.tags`, mirroring the actual axe tag set. Help text updated to say "WCAG 2.1 AA + Section 508 + best-practice" so users see the full scope. Both surfaces (CLI + extension) now use the same wide tag set and document it the same way.

**Three-site verification.** Ran `webspec audit` from the CLI and "Audit this tab" from the extension against three public URLs and compared rule counts:

| Site | CLI | Ext | Verdict |
|------|-----|-----|---------|
| `https://example.com` | 2 | 2 | ✅ exact parity (`landmark-one-main`, `region`) |
| `https://react.dev` | 4 | 5 | ✅ within tolerance — color-contrast variants drift with font rendering between headless Chrome and the user's Chrome |
| `https://demo.playwright.dev/todomvc/` | 7 | 15 | ⚠ stateful divergence — extension audited a tab with todos persisted in localStorage from earlier testing; each todo row adds DOM that axe scores. Expected and benign |

The TodoMVC gap surfaced an honest property of the tool: a runtime audit is a function of the *page's current state*. Two engineers auditing the same URL can get different findings if their sessions diverge. That's a feature, not a bug — the extension reports what the user actually sees. The CLI ships fresh-Chrome semantics; the extension ships logged-in-Chrome semantics. M6's renderer doesn't need them to be byte-equal.

### Changed

- `packages/cli/src/commands/audit.ts` — pass `config: { tags: [...DEFAULT_A11Y_TAGS] }` so `Analysis.meta.config` reflects the actual axe tag set instead of a stale narrow placeholder.
- `packages/cli/src/args.ts` — help text now describes the audit as "WCAG 2.1 AA + Section 508 + best-practice", matching the extension's tag set.
- `docs/07-build-plan.md` — every M5 checkbox marked done with the version it shipped in, plus an inline note on the deferred `webRequest` network capture (re-evaluated for M6-enables).
- `CLAUDE.md` — "Current state" rolled forward: M0–M5 complete, M6 is the only remaining v1 active milestone.
- `README.md` — opening rewritten to the shift-left framing ("browser-based shift-left companion … records workflow, audits page, renders Playwright spec"), replacing the stale pre-pivot "LLM-powered toolkit that generates Angular unit tests" line. Status section updated to "M5 done at v0.6.0."
- `docs/99-open-questions.md` — three M5 questions marked resolved with version references: axe-in-MV3 (v0.3.8), selector-hardening priority (v0.5.1, includes nth-disambiguation note), recording→renderer transport (v0.5.4, includes the review-gate detail).
- `docs/01-architecture.md` — A11yAnalyzer description corrected to mention the wider tag set (`wcag2a + wcag2aa + wcag21a + wcag21aa + section508 + best-practice`) shipped in v0.5.0, with a parity note for v0.6.0.

### Fixed

- `Analysis.meta.config.tags` from the CLI now matches what axe actually ran. Reports are now truthful about their configuration, not just their findings.

### Files Changed

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

### Verification

`pnpm -w test` green: 147/147 tests still pass. Type-check clean (`tsc --noEmit`). CLI rebuild clean. Live three-site audit-parity table above is the headline verification.

#### Replay the parity check

```sh
node packages/cli/dist/index.js audit https://example.com --format json --out /tmp/example.json
node packages/cli/dist/index.js audit https://react.dev --format json --out /tmp/react.json
node packages/cli/dist/index.js audit https://demo.playwright.dev/todomvc/ --format json --out /tmp/todomvc.json

jq -r '.findings[] | "\(.ruleId)  (\(.severity), \(.ruleSets | join(",")))"' /tmp/example.json | sort | uniq -c
# (repeat for each)
```

Then in the extension, click "Audit this tab" on each URL and compare rule IDs.

### What's next — M5 → M6

M5 is **done**. The Chrome extension is the v1 flagship surface; both modes (audit + recorder) work end-to-end on real sites; recordings export as structured JSON with hardened selectors, navigation events, session persistence, and a review-then-download gate.

**M6 — E2E renderer (`WorkflowRecording` → Playwright):**

- Deterministic pass: each `RecordedEvent` maps to a Playwright action with the recording's hardened selector. The `reason` field on `navigate` events drives the right primitive — `page.waitForURL()`, `page.reload()`, or an assertion after an SPA route change.
- LLM amplification pass (the v1 differentiator): given the action trace, the LLM emits a structured `AmplifiedRecording` with positive + negative scenarios. Renderer formats that into Playwright source. Same two-layer pattern as M2 (LLM emits typed structure, deterministic renderer formats it).
- CLI: `webspec record-to-spec <recording.json>` end-to-end.
- The `webRequest` capture decision lands here, not before: only if the renderer actually needs network metadata.

