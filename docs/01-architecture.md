# 01 — Architecture

## The spine

Two phases with a typed contract artifact between them. **Phase 1 — Analyze** turns an input (Angular source file, URL, or static bundle) into a typed `Analysis`. **Phase 2 — Render** turns an `Analysis` into a deliverable (Jest `.spec.ts` text, a11y report markdown, or VS Code/Chrome UI panels). Every UI surface consumes the same `Analysis`; none of them re-analyzes.

```
   input ──▶ [ Phase 1: Analyze ] ──▶ Analysis (typed) ──▶ [ Phase 2: Render ] ──▶ deliverable
                  (LLM or axe)                                  (deterministic)
```

## Why this shape

- **Cost & speed.** Phase 1 is the only phase that calls the LLM or axe-core; Phase 2 is pure functions over typed data. Re-rendering for a new surface (CLI vs VS Code vs Chrome) costs no LLM tokens and no DOM scans.
- **Replayability.** A serialized `Analysis` can be cached, diffed, snapshot-tested, or replayed offline. Bug reports become reproducible: attach the `Analysis`.
- **Provider isolation.** The LLM-provider adapter sits inside Phase 1 only. Renderers never see provider-specific shapes. Switching providers cannot regress rendered output.
- **Surface parity.** VS Code, Chrome, and the CLI render the same `Analysis`. Behavioral drift between surfaces is structurally hard to introduce.
- **Determinism gate.** Phase 2 is deterministic; we can golden-test rendered output. Phase 1 is not deterministic (LLM); we test it through fixtures of `Analysis` outputs.

## Modules / phases

### Phase 1 — Analyze (`packages/core/src/analyze/`)

Two analyzer kinds, both producing the same envelope shape:

- **TestPlanAnalyzer.** Parses Angular source with `ts-morph` (preferred over `@angular/compiler` for ergonomics). Extracts the typed surface: inputs, outputs, public methods, lifecycle hooks, injected deps, signal/computed declarations. Builds a prompt scoped to that surface, calls the LLM through the provider adapter, validates the response into a `TestPlan`.
- **A11yAnalyzer.** Wraps `axe-core` with the rule set tagged `wcag21aa,section508`. Two run modes: against a running URL via Puppeteer (`@axe-core/puppeteer`) for headless dev/CI use, or against the live DOM via `axe-core/browser` for the Chrome extension. Outputs an `A11yReport`.

Inputs: file path / URL / DOM handle, plus a resolved `Config`. Outputs: a discriminated `Analysis` envelope.

### LLM provider adapter (`packages/core/src/llm/`)

A small interface — `LLMProvider` — with `complete(messages, schema): Promise<Validated<T>>`. v1 implementations: `AnthropicAdapter`, `OpenAIAdapter`. The interface enforces structured-output validation (zod) at the seam so renderer code never branches on provider quirks. Provider selection and credential lookup is the only place the SDKs are imported.

### Phase 2 — Render (`packages/core/src/render/`)

- **TestRenderer.** Takes a `TestPlan`, emits Jest `.spec.ts` source. Pure function. Templating is plain TypeScript string assembly, not a templating library — keeps the bar for contributors low and renders trivially golden-testable.
- **ReportRenderer.** Takes an `A11yReport`, emits Markdown and JSON variants for the CLI/CI. UI surfaces (VS Code panel, Chrome popup) render their own React/HTML view from the same typed report — they don't re-parse the markdown.

### Surfaces (separate packages)

- `packages/cli/` — `commander`-based CLI. Wraps `core`. The first surface implemented; validates the contract.
- `packages/vscode-extension/` — VS Code commands and sidebar. Wraps `core` directly (no IPC; runs in the extension host).
- `packages/chrome-extension/` — Manifest V3. Bundles a subset of `core` (`A11yAnalyzer` browser mode + `ReportRenderer`); test generation is *not* exposed in the Chrome surface (no filesystem access).
- `packages/config/` — shared config schema (`bellese-test.config.json`) with auto-detection logic for Angular projects.

## The contract artifact

The single typed shape that crosses the Phase 1 / Phase 2 seam. Every UI surface receives an `Analysis` and renders it; nothing else.

```ts
// packages/core/src/types/analysis.ts (sketch)

export type Analysis =
  | { kind: 'testPlan'; data: TestPlan; meta: AnalysisMeta }
  | { kind: 'a11yReport'; data: A11yReport; meta: AnalysisMeta };

export type AnalysisMeta = {
  schemaVersion: '1';
  toolVersion: string;
  createdAt: string; // ISO-8601
  source: { kind: 'file' | 'url' | 'dom'; ref: string };
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
  findings: Finding[];   // each tagged with which rule sets flagged it
  passCount: number;
  incompleteCount: number;
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
│   │   │   ├── analyze/            # TestPlanAnalyzer, A11yAnalyzer
│   │   │   ├── llm/                # LLMProvider interface + adapters
│   │   │   ├── render/             # TestRenderer, ReportRenderer
│   │   │   └── types/              # Analysis, TestPlan, A11yReport
│   │   └── tests/
│   ├── cli/                        # bellese-test CLI
│   ├── vscode-extension/           # VS Code surface
│   ├── chrome-extension/           # Manifest V3 surface
│   └── config/                     # config schema + project auto-detection
├── pnpm-workspace.yaml
├── package.json                    # root workspace
├── infra/terraform/                # placeholder (no v1 deployment)
└── Dockerfile                      # CLI image
```

## Subsystem responsibilities

| Subsystem            | Owns                                                                  | Talks to                              |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `core/analyze`       | Source parsing, axe orchestration, LLM prompt construction & validation | `core/llm`, axe-core, ts-morph, Puppeteer |
| `core/llm`           | Provider abstraction; SDK imports live here only                      | Anthropic / OpenAI / future SDKs      |
| `core/render`        | `Analysis` → text/markdown/JSON                                       | (pure)                                |
| `core/types`         | Discriminated `Analysis` and its sub-shapes                           | (consumed by everything)              |
| `cli`                | Argv parsing, exit codes, file I/O                                    | `core`, `config`                      |
| `vscode-extension`   | VS Code commands, panels, SecretStorage for keys                      | `core`, `config`, VS Code API         |
| `chrome-extension`   | Manifest V3 popup, content script DOM hand-off, chrome.storage for keys | `core` (subset), Chrome API           |
| `config`             | Config schema + Angular project auto-detection                        | (consumed by surfaces)                |

## Non-goals for the architecture

- **Real-time / streaming UX in v1.** Test generation completes in one round-trip; we do not stream tokens to the editor.
- **Server-side state.** No daemon, no shared cache. Each invocation is self-contained.
- **Custom a11y rules.** axe-core's rule set is the contract; we do not extend it in v1.
- **Hot-loading of LLM adapters.** Adapters are compiled in. Adding one is a code change, not a runtime plug-in.
- **Sharing code between the Chrome extension and Node packages without a build seam.** Manifest V3 constraints (no `eval`, no Node built-ins) mean `core` is built in two flavors: a Node bundle and a browser bundle that excludes filesystem-touching analyzers.
