# 09 — Test Planning Surface (parked, not scheduled)

Three flavors of a future "test cases live in the extension" surface, captured end-of-day 2026-05-15 after Rob raised the idea. The Settings tab proved that an extension-hosted side page is approachable; the question is what such a page would *do* next. Not on any roadmap yet — decision deferred until at least one flavor earns its way in.

## Why this exists

After shipping v1.2 (test library on disk) and v1.3.0 (auth profiles via Settings), Rob's mental model of the tool started pulling on a thread the design hadn't named: **tests should live inside the extension as first-class things, not just as files that get produced after recording**. The "library" today is `~/Downloads/webspec/<slug>/` plus Playwright UI; that works for *running* tests, but doesn't address authoring, planning, or annotating them outside the record loop.

A test-planning surface inside the extension would close that gap. It would also help Rob specifically — reading long terminal output is hard for him, so a UI he can *see* his tests in is partly an accessibility lift.

## The three flavors

We sketched these conversationally; the doc preserves them verbatim so the next session can pick up cold.

### Flavor A — Test plan / scratch pad

**What it is.** A page where you write the workflows you intend to test in prose:

> Test 1 — Create a Medicare lead from My Work tasks, source = Complainant
> Test 2 — Edit the lead's classification to Beneficiary Fraud
> Test 3 — Reassign the lead to a different Supervisor and close it

Saved as a list (one entry per planned test) with checkboxes. Clicking a planned entry → opens the popup's record flow with that entry's name + description pre-filled. After Save, the planned entry gets marked as "recorded" and links to the saved test in `~/Downloads/webspec/<slug>/`.

**Why it's interesting.** Bridges *planning* to *recording* without leaving the extension. Forces intent before action — a planner-first workflow that matches how a real QA review session would feel.

**What's hard.** State sync between "planned" entries and "recorded" entries — when does a planned entry get linked to the saved slug? What if you re-record? What if you delete a saved test on disk; does the planned entry orphan or unlink? Same data-canonicalness question we faced and dodged in v1.2.

### Flavor B — Notes on existing recordings

**What it is.** Open a saved test in the extension → see metadata (name, description, runAs, when recorded, event count) and add free-form prose notes ("This test is flaky when the network is slow," "Re-record after the date picker redesign ships"). Tag tests ("smoke", "regression"). Mark them "needs re-record." Lives alongside `recording.json` — either as a `notes.md` in the slug folder or as additional fields on `recording.json`.

**Why it's interesting.** Augments artifacts that already exist. Doesn't require new state-sync — each recording is the canonical home for its own notes. Most useful when there are *many* recordings and Rob needs to remember which ones to revisit.

**What's hard.** Less novel than Flavor A. Probably essential eventually but doesn't itself change the workflow shape — it's polish on top of what we have.

### Flavor C — Compose a workflow without recording

**What it is.** Type test steps in plain English:

> 1. Navigate to /trackers/my-work/tasks
> 2. Click the add button
> 3. Choose Lead (CSE) from the menu
> 4. Select Medicare as the source
> 5. Verify the page navigates to a record URL matching /record/cse/CSE-…

The LLM converts that into a `WorkflowRecording` (or directly into a Playwright `.spec.ts`). Saves into the library like a recorded test.

**Why it's interesting.** Recording is bandwidth-limited — you can only record what you click. Some tests are easier to *describe* than to *demonstrate* (especially edge cases, negative paths, or hypothetical user journeys before the UI exists). This connects to the deferred LLM amplification path: the same Bedrock provider that adds negative scenarios could synthesize positive ones from prose.

**What's hard.** Most ambitious. The LLM has to reason about a live page it can't see — needs the page DOM as context, or a strict vocabulary the user writes against. Failure modes are subtle (the LLM hallucinates selectors that don't exist). Probably v2 material, not v1.x.

## How to pick

Each flavor has a different cost/value profile:

| Flavor | Build cost | Value when shipped | Risk |
|---|---|---|---|
| A — Plan + record | Medium (new page, state-sync) | High — changes the workflow shape | State sync between plans and saves |
| B — Notes on recordings | Low (extra field on recording.json + a notes view) | Moderate — polish, but real | Low |
| C — Compose without recording | High (LLM integration in extension, needs Bedrock-in-browser or proxy) | High — opens a new authoring mode | Hallucinated selectors, security of LLM creds in browser |

Open question for the next design session: *which flavor solves the biggest gap right now?* Rob's lived experience with v1.2 + v1.3 will tell us. If he records 20 UCM tests and starts losing track of which is which, Flavor B is the answer. If he wants to bring colleagues into planning before they're ready to record, Flavor A. If recording can't capture the negative paths he cares about, Flavor C.

## Connection to existing milestones

- **v1.4 (Suites)** — designed in `docs/08-test-library.md`. Still the next built milestone unless a planning-surface flavor pre-empts it. Suite composition is naturally extension-of-recordings, not planning-before-recording — different problem.
- **LLM amplification (v0.7.2)** — already implemented for the CLI side. Flavor C would extend the LLM's role from "amplify a recording" to "synthesize a recording from prose." Same `LLMProvider` seam, different prompt.
- **Reading difficulty / voice interface (parked)** — a planning surface is partly an accessibility ask. Whatever flavor lands should be designed UI-first (visual, scannable), not text-dense.

## Status

**Parked.** Bring up explicitly in the next planning session. Don't start any of these without picking a flavor and updating this doc with a chosen design.
