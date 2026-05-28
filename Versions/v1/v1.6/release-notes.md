# v1.6

## v1.6.0 — Input Output Wiring Design (2026-05-28)

### Problem

Item #3 in the post-v1 stack — Input/output wiring — was a one-line stub in `docs/10-team-shareability.md` § "v1.5+ futures":

> Test Cases declare their outputs (`createLead → { leadId }`) and inputs. The Queue composer wires them. Enables Queue 3-style "start at step 5 with a record passed from step 4."

Enough to know what shipping it means, not enough to build from. Open shape questions: how do Test Cases declare outputs (recorded vs. user-declared vs. LLM-proposed)? How do they accept inputs (parametric vs. step-level overrides)? How does a Queue step reference an earlier step's output (alias vs. step number vs. user-named)? How do iterations interact with output wiring? Per the project's "design before code" working norm, these had to be locked before the schema, UI, and renderer changes could begin.

### Solution

Aligned the four foundational shape decisions in conversation, then wrote them into `docs/10-team-shareability.md` as a new "v1.6 — Input/Output Wiring (design locked, 2026-05-28)" section that mirrors the v1.5.0 / v1.5.1 design-locked sections immediately above it.

**Decisions locked (one option chosen for each):**

1. **Outputs — user declares at Save.** Two source kinds in v1.6 MVP: a URL regex with a capture group (`/\/leads\/(\d+)/` → `match[1]`) and the text content of a CSS selector (`page.locator(sel).first().textContent()`). The user names each output and picks its source kind from a dropdown in the Save panel. No inference, no LLM proposals — explicit, the user owns the contract.

2. **Inputs — parametric Test Cases.** At Save, the popup surfaces the recording's fill/input events with their literal values; the user checks any value they want to promote and names it. Helper signature becomes `createLead({ page, context }, { leadName }) → { leadId, leadName }`. Whole-value substitution only (no substring parameterization in v1.6).

3. **Step references — auto-aliased `<slug>_<index>`.** A Queue with `[createLead, updateLead]` renders as `const createLead_1 = await createLead(...)` and `const updateLead_2 = await updateLead(...)`. Stable, readable, no extra user typing. Aliases are positional; reorder is handled by re-rendering on Save.

4. **Iterations × I/O — iterated steps can't supply outputs.** A step with `iterations > 1` is hidden from the output-source dropdown for later steps. Iterations stay a "do this N times" smoke pattern. Iterated steps can still *consume* inputs (same value each pass; per-iteration variation is the next milestone's job).

**Design doc covers:**

- The mental model — a Test Case as a function with named inputs and outputs.
- `TestCase` schema additions (`inputs?: TestCaseInput[]`, `outputs?: TestCaseOutput[]`) with both fields optional for backward compatibility with v1.5.x recordings.
- `QueueStep` schema addition (`inputValues?: Record<string, { mode: 'constant' | 'output', ... }>`).
- Save UI shape — two collapsible panels under the existing name/description/runAs fields.
- Composer UI shape — per-step Inputs subsection with a wiring dropdown (constant | from step N).
- Helper signature & rendered output, including the "scan-forward to decide whether to assign the return value" rule that keeps non-wired call sites clean.
- Standalone `recording.spec.ts` wrapper behavior — inputs default to the **recorded literals** (not empty strings) so standalone replay still reproduces the recording faithfully.
- Renderer changes — three pieces touch (`renderTestCaseModule`, `renderQueueSpec`, the standalone wrapper).
- Iteration semantics — the formal rules implied by decision #4.
- Backward compatibility & self-heal — v1.5.x Test Cases keep working; pre-v1.6 Queues re-render unchanged unless their referenced Test Cases gain declared inputs.
- Out of scope for v1.6 — per-iteration input variation, substring substitution, attribute / response-body extraction, iterated-step outputs as arrays, proactive cross-reference validation.
- Patch plan inside v1.6 — design (this patch) → schema → save UI → composer UI → renderer → integration tests.

Also updated the v1.5+ futures list's item #3 entry to `✅ Design locked above — implementation begins in v1.6.1`, matching the convention used for items #1 and #2 above it.

### New

- `docs/10-team-shareability.md` — new "v1.6 — Input/Output Wiring (design locked, 2026-05-28)" section with full design.

### Changed

- `docs/10-team-shareability.md` § "v1.5+ futures" — item #3 marked design-locked with a pointer to the new section.

### Fixed

- N/A — doc-only patch.

### Files Changed

| File | Change |
|------|--------|
| `docs/10-team-shareability.md` | **New section** — v1.6 Input/Output Wiring design (~190 lines). **Edit** — marked item #3 in v1.5+ futures as design-locked. |
| `Versions/v1/v1.6/release-notes.md` | This entry (v1.6 minor file created by `new-version.sh --minor`). |

### Known issues / notes

- No code changes in this patch — the contract is the spec. v1.6.1 begins implementation with the `TestCase` + `QueueStep` schema additions (zod + storage), no UI yet.
- The standalone-spec default-input behavior (recorded literals vs. empty strings) was flagged as "open implementation detail" mid-draft and resolved inline to **recorded literals** before locking. Captured here so future patches don't reopen it.
- Cross-reference validation when a Test Case removes a previously-declared input/output is intentionally deferred to v1.7+ — the next Queue Save will surface the issue, or `npm test` will fail with a TypeScript error. Either is loud enough for the MVP.
