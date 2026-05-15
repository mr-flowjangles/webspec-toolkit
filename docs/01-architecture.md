# 01 — Architecture

## The spine

Two phases with a typed contract artifact between them. **Phase 1 — Analyze** turns an input (Angular source file, URL, static bundle, or live user workflow) into a typed `Analysis`. **Phase 2 — Render** turns an `Analysis` into a deliverable (Jest `.spec.ts`, a11y report, Playwright `.spec.ts`, or VS Code/Chrome UI panels). Every UI surface consumes the same `Analysis`; none of them re-analyzes.

```
   input ──▶ [ Phase 1: Analyze ] ──▶ Analysis (typed) ──▶ [ Phase 2: Render ] ──▶ deliverable
              (LLM, axe, recorder)                              (deterministic)
```

## Why this shape

- **Cost & speed.** Phase 1 is the only phase that calls the LLM or axe-core; Phase 2 is pure functions over typed data. Re-rendering for a new surface (CLI vs VS Code vs Chrome) costs no LLM tokens and no DOM scans.
- **Replayability.** A serialized `Analysis` can be cached, diffed, snapshot-tested, or replayed offline. Bug reports become reproducible: attach the `Analysis`.
- **Provider isolation.** The LLM-provider adapter sits inside Phase 1 only. Renderers never see provider-specific shapes. Switching providers cannot regress rendered output.
- **Surface parity.** VS Code, Chrome, and the CLI render the same `Analysis`. Behavioral drift between surfaces is structurally hard to introduce.
- **Determinism gate.** Phase 2 is deterministic; we can golden-test rendered output. Phase 1 is not deterministic (LLM); we test it through fixtures of `Analysis` outputs.

## Modules / phases

### Phase 1 — Analyze (`packages/core/src/analyze/`)

Three analyzer kinds, all producing the same envelope shape:

- **TestPlanAnalyzer** _(Node-only)_. Parses Angular source with `ts-morph` (preferred over `@angular/compiler` for ergonomics). Extracts the typed surface: inputs, outputs, public methods, lifecycle hooks, injected deps, signal/computed declarations. Builds a prompt scoped to that surface, calls the LLM through the provider adapter, validates the response into a `TestPlan`.
- **A11yAnalyzer** _(both flavors)_. Wraps `axe-core` with the rule set tagged `wcag2a, wcag2aa, wcag21a, wcag21aa, section508, best-practice` (widened from the original `wcag21aa,section508` at v0.5.0; `best-practice` adds `landmark-one-main`, `region`, `heading-order`, and similar hygiene rules a human reviewer typically flags). Two run modes: against a running URL via Puppeteer (`@axe-core/puppeteer`) for headless dev/CI use, or against the live DOM via `axe-core/browser` for the Chrome extension. CLI and extension use the identical tag set — parity verified at v0.6.0. Outputs an `A11yReport`.
- **WorkflowRecorder** _(browser-only)_. Lives in the Chrome-extension flavor of `core`. A content script captures DOM events (clicks, input, change, submit, navigation, key events) plus an outgoing-network-request log via `webRequest`. At each capture point it computes a hardened selector for the target (preference order: `data-testid` → `aria-label`/`role+name` → text content for buttons/links → CSS path as last resort). The output is a `WorkflowRecording` — a deterministic event trace with no LLM in the loop yet.

Inputs: file path / URL / DOM handle / live tab session, plus a resolved `Config`. Outputs: a discriminated `Analysis` envelope.

### LLM provider adapter (`packages/core/src/llm/`)

A small interface — `LLMProvider` — with `complete(messages, schema): Promise<Validated<T>>`. v1 ships `BedrockAdapter` (Anthropic models accessed via Amazon Bedrock with standard AWS credentials — see `docs/mission.md`); the interface admits future providers (other Bedrock models, direct API for OSS users, etc.) without renderer changes. The interface enforces structured-output validation (zod) at the seam so renderer code never branches on provider quirks. Provider selection and credential lookup is the only place vendor/cloud SDKs are imported.

### Phase 2 — Render (`packages/core/src/render/`)

- **TestRenderer.** Takes a `TestPlan`, emits Jest `.spec.ts`. Pure function. Templating is plain TypeScript string assembly, not a templating library — keeps the bar for contributors low and renders trivially golden-testable.
- **ReportRenderer.** Takes an `A11yReport`, emits Markdown and JSON variants for the CLI/CI. UI surfaces (VS Code panel, Chrome popup) render their own React/HTML view from the same typed report — they don't re-parse the markdown.
- **E2ERenderer.** Takes a `WorkflowRecording`, emits Playwright `.spec.ts`. The recording's user-supplied `name` and `description` (captured in the popup before recording starts) become the `test()` title and a leading comment in the spec. Two-pass: (1) deterministic translation — each captured event becomes a Playwright action; (2) **optional LLM polish** — given the action trace, the LLM inserts assertions inferred from observed state changes (e.g. "after submit, expect heading 'Success' to appear") and proposes selector consolidations. The deterministic pass is sufficient on its own; the LLM pass is value-add and skipped if no provider is configured.

### Surfaces (separate packages)

- `packages/chrome-extension/` — **The v1 primary surface.** Manifest V3. Bundles the browser flavor of `core`: `A11yAnalyzer` (browser mode), `WorkflowRecorder`, and `ReportRenderer`. **Does not** bundle `TestPlanAnalyzer` (no filesystem access) or `E2ERenderer` (recordings are exported as JSON; rendering happens in Node — CLI — to avoid bundling the LLM SDK in the browser). Recordings transport from the Chrome ext to the Node renderer via download-as-JSON in v1.
- `packages/cli/` — `commander`-based CLI. Wraps `core`. **v1 surface area reduced to CI-relevant commands:** `audit <url>` (M4) and `record-to-spec <recording.json>` (M6). The original `gen` (unit-test gen) and `init` (Angular auto-detection) commands are deferred — see `07-build-plan.md` "Out of v1 active path."
- `packages/vscode-extension/` — **Deferred from v1.** Stub left in the workspace so M0 build coherence holds; real activation is post-v1. Browser-first means browser-only in v1.
- `packages/config/` — config schema. **v1 surface area reduced** — without unit-test gen on the v1 path, config has no production consumer in v1; the package stays as a stub.

## The contract artifact

The single typed shape that crosses the Phase 1 / Phase 2 seam. Every UI surface receives an `Analysis` and renders it; nothing else.

```ts
// packages/core/src/types/analysis.ts (sketch)

export type Analysis =
  | { kind: 'testPlan'; data: TestPlan; meta: AnalysisMeta }
  | { kind: 'a11yReport'; data: A11yReport; meta: AnalysisMeta }
  | { kind: 'workflowRecording'; data: WorkflowRecording; meta: AnalysisMeta };

export type AnalysisMeta = {
  schemaVersion: '1';
  toolVersion: string;
  createdAt: string; // ISO-8601
  source: { kind: 'file' | 'url' | 'dom' | 'recordingSession'; ref: string };
  config: ResolvedConfig;
};

export type TestPlan = {
  unit: { kind: 'component' | 'service' | 'directive' | 'pipe'; name: string; filePath: string };
  surface: {
    inputs: SurfaceInput[];
    outputs: SurfaceOutput[];
    publicMethods: SurfaceMethod[];
    lifecycle: LifecycleHook[];
    deps: InjectedDep[];
  };
  cases: TestCase[]; // LLM-generated; each names what it tests + the arrange/act/assert plan
  framework: 'jest';
  styleHints: { useStandalone: boolean; useSignals: boolean; useInject: boolean };
};

export type A11yReport = {
  target: { kind: 'url' | 'dom' | 'staticBundle'; ref: string };
  ruleSet: { tags: ('wcag21aa' | 'section508')[]; engineVersion: string };
  findings: Finding[]; // each tagged with which rule sets flagged it
  passCount: number;
  incompleteCount: number;
};

export type WorkflowRecording = {
  startedAt: string; // ISO-8601
  endedAt: string;
  startUrl: string;
  events: RecordedEvent[]; // ordered, monotonically timestamped
  network: NetworkRequest[]; // request URLs + methods only in v1; no response bodies
  framework: 'playwright';
  // The recorder is deterministic; LLM polish happens during render, not capture.
};

export type RecordedEvent =
  | { t: number; kind: 'click'; selector: HardenedSelector; targetText?: string }
  | { t: number; kind: 'input'; selector: HardenedSelector; value: string; sensitive: boolean }
  | { t: number; kind: 'change'; selector: HardenedSelector; value: string }
  | { t: number; kind: 'submit'; selector: HardenedSelector }
  | { t: number; kind: 'keydown'; key: string; selector?: HardenedSelector }
  | { t: number; kind: 'navigate'; url: string }
  | { t: number; kind: 'assertObserved'; observation: ObservedState }; // candidate assertions surfaced by recorder

export type HardenedSelector = {
  preferred: string; // best of: data-testid, role+name, text, css
  strategy: 'testId' | 'role' | 'text' | 'css';
  fallbacks: string[]; // in priority order
};
```

`schemaVersion` is part of the artifact from day one — every renderer version-checks. This is how we earn the right to evolve the IR without breaking surfaces in lockstep.

Schema spec: see `02-contract-spec.md` (to be created when the IR exceeds what fits here).

## File / process layout

```
angular-automated-testing/
├── CLAUDE.md
├── docs/
├── packages/
│   ├── core/                       # Phase 1 + Phase 2 + LLM adapters
│   │   ├── src/
│   │   │   ├── analyze/
│   │   │   │   ├── test-plan/      # TestPlanAnalyzer (Node)
│   │   │   │   ├── a11y/           # A11yAnalyzer (Node + browser flavors)
│   │   │   │   └── recorder/       # WorkflowRecorder (browser only)
│   │   │   ├── llm/                # LLMProvider interface + adapters
│   │   │   ├── render/             # TestRenderer, ReportRenderer, E2ERenderer
│   │   │   └── types/              # Analysis, TestPlan, A11yReport, WorkflowRecording
│   │   └── tests/
│   ├── cli/                        # webspec CLI
│   ├── vscode-extension/           # VS Code surface
│   ├── chrome-extension/           # Manifest V3 surface (audit + recorder)
│   └── config/                     # config schema + project auto-detection
├── pnpm-workspace.yaml
├── package.json                    # root workspace
├── infra/terraform/                # placeholder (no v1 deployment)
└── Dockerfile                      # CLI image
```

## Subsystem responsibilities

| Subsystem          | Owns                                                                                           | Talks to                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `core/analyze`     | Source parsing, axe orchestration, recorder event capture, LLM prompt construction/validation  | `core/llm`, axe-core, ts-morph, Puppeteer, DOM APIs       |
| `core/llm`         | Provider abstraction; vendor/cloud SDK imports live here only                                  | `@anthropic-ai/bedrock-sdk` (BedrockAdapter); future SDKs |
| `core/render`      | `Analysis` → text / markdown / JSON / Playwright code                                          | `core/llm` (E2ERenderer LLM-polish pass), pure otherwise  |
| `core/types`       | Discriminated `Analysis` and its sub-shapes                                                    | (consumed by everything)                                  |
| `cli`              | Argv parsing, exit codes, file I/O, recording-import                                           | `core`, `config`                                          |
| `vscode-extension` | VS Code commands, panels, SecretStorage for keys                                               | `core`, `config`, VS Code API                             |
| `chrome-extension` | Manifest V3 popup, content script DOM hand-off, recorder UI + capture, chrome.storage for keys | `core` (browser bundle: a11y + recorder), Chrome API      |
| `config`           | Config schema + Angular project auto-detection                                                 | (consumed by surfaces)                                    |

## Non-goals for the architecture

- **Real-time / streaming UX in v1.** Test generation completes in one round-trip; we do not stream tokens to the editor.
- **Server-side state.** No daemon, no shared cache. Each invocation is self-contained.
- **Custom a11y rules.** axe-core's rule set is the contract; we do not extend it in v1.
- **Hot-loading of LLM adapters.** Adapters are compiled in. Adding one is a code change, not a runtime plug-in.
- **Sharing code between the Chrome extension and Node packages without a build seam.** Manifest V3 constraints (no `eval`, no Node built-ins) mean `core` is built in two flavors: a Node bundle (CLI, VS Code) including `TestPlanAnalyzer` and `E2ERenderer`, and a browser bundle (Chrome) including `A11yAnalyzer` and `WorkflowRecorder` only.
- **In-extension recording playback.** v1 emits a Playwright `.spec.ts`; replay happens in the user's existing test runner. The Chrome ext does not become a test runner.
- **Network-response capture.** v1 records request URLs + methods, not response bodies. Stubbing recorded responses is a post-v1 concern.
- **Auto-named tests on the recorder critical path.** The deterministic recorder must work without an LLM. The LLM adds polish (test name, assertions, selector consolidation) at render time and is skipped if no provider key is configured.
