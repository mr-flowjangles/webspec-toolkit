# webspec — Mission Statement

## Mission

**Shift left and fail faster on web app development.** webspec is a browser-based dev-time companion: a developer (or designer, or QA, or 508 reviewer) walks through a web app in Chrome, and the tool catches problems before they reach formal testing.

**Success metric (sharper framing of the same idea):** save time and stop defects from reaching the test phase. Every defect that webspec surfaces during dev is one fewer round-trip through QA, one fewer compliance-review escalation, and one fewer bug filed by a customer.

Three things, all on a live page:

1. **Watch a user move through a workflow** and capture exactly what they did — clicks, fills, navigation, network calls.
2. **Turn that workflow into a test plan with positive AND negative scenarios** — the recorded happy path, plus LLM-amplified failure modes (invalid input, empty fields, error states, edge cases the user didn't think to try). Output is a runnable Playwright spec; the spec is also a fast-feedback report of "things that could go wrong here."
3. **Audit the page for Section 508 + WCAG 2.1 AA issues** — at dev time, not at compliance review.

The whole point is short feedback loops. The tool runs while you're building, not after.

## Who this is for

Engineers building web frontends for federal and federal-adjacent customers, where Section 508 compliance is contractual and quality bugs caught late are expensive. Plus the non-developers (QA, designers, 508 reviewers, PMs) who can drive the recorder without writing code. The tool is **framework-agnostic by design** — it watches rendered pages and DOM events, not source files. Angular today, React/Vue/Svelte for free.

## What the tool must do (v1)

1. **Record workflows in Chrome.** Click "Record" in the popup, drive the app, click "Stop." The tool captures DOM events (clicks, input, change, submit, navigation, key events), outgoing network requests (URL + method, no response bodies in v1), and a hardened selector for every targeted element (`data-testid` → `aria-label`/`role+name` → text → CSS fallback).
2. **Turn the recording into a test plan with positive + negative scenarios, then render it as Playwright.** The user names and describes the test in the Chrome popup before recording begins — that name becomes the `test()` title and the description rides into the spec as a comment. Two render passes: (a) deterministic translation of every recorded event into a Playwright action; (b) LLM amplification — given the recorded happy path + observed network calls + page state, the LLM inserts assertions and **generates negative scenarios** (e.g. user filled a valid email → also test empty / malformed / 500-char / special-char input). Output is one or more runnable Playwright `.spec.ts` files. The LLM pass is skipped if no provider is configured — the deterministic happy-path spec still emits.
3. **Audit a11y on the live page.** Run `axe-core` with the `wcag21aa` + `section508` tag set. Report distinguishes 508 vs WCAG-only findings so federal-compliance reviewers can scope.
4. **Reach Anthropic models via AWS Bedrock** using the standard AWS credential chain. The `LLMProvider` interface stays provider-agnostic so adding adapters later is a code change scoped to one new file.
5. **Run primarily in the browser.** The Chrome extension is the v1 surface. A thin CLI exists for CI integration (`webspec audit <url>`, `webspec record-to-spec <recording.json>`); VS Code integration is post-v1.

## Hard constraints

- **Section 508 / WCAG 2.1 AA coverage is non-negotiable.** Reports must distinguish 508 vs WCAG-only findings.
- **Framework-agnostic at the seam.** No file in the codebase may assume Angular, React, etc. for the page-observing capabilities. axe and the recorder both work on rendered output, period.
- **LLM-provider agnostic at the seam.** No file may import a vendor/cloud SDK outside the corresponding adapter module. Switching providers (or adding new ones) must be a code change scoped to a new adapter file plus a config flip, never a renderer change.
- **No code or data sent off-device without user consent.** LLM calls are opt-in per session; a11y scans run locally; recordings stay local until the user chooses to render them with LLM polish.
- **Recordings are LLM-free at capture.** Recordings can contain PHI/PII (federal customers). The LLM only enters Phase 2, when the user chooses to amplify a recording into a test plan. A recording can be exported, scrubbed, and only then rendered.

## Decisions already made

- **Language:** TypeScript across all packages.
- **E2E framework target:** Playwright. Cypress deferred (see `99-open-questions.md`).
- **A11y engine:** axe-core with `wcag21aa` + `section508` tags. We do not roll our own ruleset.
- **Monorepo tooling:** pnpm workspaces. No Nx/Turbo for v1.
- **LLM access via AWS Bedrock.** Federal-customer work runs on AWS-resident infrastructure for compliance reasons; all Anthropic-model traffic goes through **Amazon Bedrock** with the standard AWS SDK default credential chain (env vars, `~/.aws/credentials`, IAM instance role) — never the direct Anthropic API. v1 ships a `BedrockAdapter`. The LLM is value-add for amplification (negative scenarios, assertion generation, selector consolidations) — test naming is user-supplied, not LLM-inferred. Not load-bearing — recordings still produce a runnable Playwright spec without a configured provider.
- **Deployment:** Chrome extension installs unpacked / via Chrome Web Store; CLI ships as a Docker image; AWS Terraform stub kept for future team-shared services.
- **PR ownership:** Rob initiates PRs. Claude does not push branches or open PRs without explicit instruction.

## Scope explicitly _out_ of v1

- **Unit-test generation from source files.** The Angular `.component.ts` → Jest `.spec.ts` capability that shipped in v0.3.0 (M2) stays in the codebase as foundation, but is not on the v1 active path. It's a productivity tool, not a shift-left signal — and the architecture decision was made that "look at the page" is what the tool does in v1. If unit-test-gen earns its way back (e.g. as a save-time watcher that triggers automatically), that's a post-v1 story.
- **VS Code extension.** Browser-first means browser-only for v1. A VS Code surface adds friction without adding shift-left value when the dev is already in Chrome driving their app. Deferred to post-v1.
- **In-extension recording playback.** v1 emits a Playwright `.spec.ts`; users run replay via Playwright like any other test.
- **Network-response mocking.** v1 captures request URLs + methods; recording response bodies and stubbing them on replay is post-v1.
- **Karma + Jasmine, Cypress.** Playwright is the v1 e2e target.
- **Manual a11y review workflow** (annotation, sign-off, audit trail). Automated scanning only in v1.
- **Telemetry / usage analytics, marketplace publishing automation.** Internal install via unpacked extension is enough for v1.
- **Bellese-managed LLM proxy** or shared Bedrock allocation infrastructure — every developer uses their own AWS credentials in v1.

## Working style

The team aligns on design before writing code. Decisions are recorded in version-controlled `docs/`. Deferred decisions are tracked explicitly in `99-open-questions.md` with their resolution triggers. Unanticipated questions surfaced during implementation pause the work until the docs catch up — no silent decisions in code.

Versions follow three-part semver, one PR per version. Release notes are cumulative under `Versions/v{major}/v{major}.{minor}.{patch}/`.

---

## What this brief deliberately does NOT prescribe

To keep design space open:

- **The exact intermediate representation between recording and Playwright output.** The current shipped `WorkflowRecording` artifact may flow directly into the Playwright renderer, or it may be promoted into a richer `TestPlan` (the contract artifact already exists from M2) before rendering. Decide at M6 implementation. See `99-open-questions.md`.
- **The exact prompt strategy for LLM amplification.** Which negative scenarios to generate, how aggressively, and how to constrain them to plausible cases — TBD at M6.
- **Selector-hardening priority for the recorder** (data-testid first? role-based fallbacks? text?). Leaning resolved (data-testid > role+name > text > css), confirm at M5 spike. See `99-open-questions.md`.
- **PHI/PII masking strategy beyond `<input type="password">`.** A richer policy is needed for federal-customer recordings; defer until we see what real recordings look like.
- **How a recording transports from the Chrome extension to a Node renderer.** v1 leaning toward download-as-JSON; localhost daemon is a post-v1 alternative if the download flow proves clunky.
