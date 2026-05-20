// @webspec/core — shared analyzer + renderer + LLM provider seam.
// Phase 1 analyzers (test-plan, a11y, recorder) and Phase 2 renderers
// (test, report, e2e) land in their respective milestones (M2, M4, M6).

export const PACKAGE_NAME = '@webspec/core';

// Contract artifact — the typed shape every analyzer produces and every renderer consumes.
export * from './types/analysis.js';

// LLM provider seam — vendor-neutral interface + Bedrock adapter.
// IMPORTANT: `./llm/bedrock.js` imports `@anthropic-ai/bedrock-sdk`. Browser
// bundles (Chrome extension) must exclude that module from their entry graph.
// The interface in `./llm/provider.js` is browser-safe.
export type { ChatMessage, CompletionRequest, LLMProvider, Role } from './llm/provider.js';
export { LLMValidationError } from './llm/provider.js';
export { BedrockAdapter, type BedrockAdapterOptions } from './llm/bedrock.js';

// Phase 1 — TestPlan analyzer (source-driven Jest test generation).
// Node-only: `./analyze/test-plan/parser.js` imports `ts-morph`. Browser
// bundles must exclude this module too.
export {
  TestPlanAnalyzer,
  NoComponentFoundError,
  type AnalyzeOptions,
} from './analyze/test-plan/analyzer.js';
export {
  parseComponentSurface,
  parseComponentSurfaceFromText,
  type ParsedComponentSurface,
} from './analyze/test-plan/parser.js';
export { SYSTEM_PROMPT, formatUserPrompt } from './analyze/test-plan/prompt.js';

// Phase 1 — AmplifyAnalyzer (WorkflowRecording → AmplifiedRecording via LLM).
// Node-only because it requires a configured LLMProvider; browser bundles
// can still consume the rendered output via the IR schema + e2e renderer.
export { AmplifyAnalyzer } from './analyze/amplify/analyzer.js';
export {
  SYSTEM_PROMPT as AMPLIFY_SYSTEM_PROMPT,
  formatUserPrompt as formatAmplifyUserPrompt,
} from './analyze/amplify/prompt.js';

// Phase 2 — TestRenderer (TestPlan → Jest .spec.ts text). Pure function;
// browser-safe (uses string ops, no Node `path`).
export { renderTestPlan } from './render/test/renderer.js';

// Phase 1 — A11yAnalyzer. The Node-mode analyzer imports `puppeteer` +
// `@axe-core/puppeteer`; browser bundles (Chrome extension) must exclude
// `./analyze/a11y/analyzer.js` and call `normalizeAxeResults` directly with
// their own `AxeResults`.
export {
  A11yAnalyzer,
  DEFAULT_A11Y_TAGS,
  type AnalyzeUrlOptions as A11yAnalyzeUrlOptions,
  type AnalyzePageOptions as A11yAnalyzePageOptions,
} from './analyze/a11y/analyzer.js';
export { normalizeAxeResults, type NormalizeTarget } from './analyze/a11y/normalize.js';

// Phase 2 — A11y ReportRenderer (A11yReport → Markdown / JSON). Pure functions;
// browser-safe (string ops + JSON.stringify, no Node deps).
export {
  renderA11yReportMarkdown,
  renderA11yReportJson,
} from './render/a11y/renderer.js';

// Phase 2 — E2ERenderer (WorkflowRecording → Playwright .spec.ts text). Pure
// function; browser-safe. v0.7.0 ships the deterministic pass over a captured
// recording; v0.7.1 adds the AmplifiedRecording renderer (one test() block per
// scenario); v0.7.2 wires the LLM that produces the AmplifiedRecording.
export {
  renderPlaywrightSpec,
  renderAmplifiedPlaywrightSpec,
  type RenderE2EOptions,
} from './render/e2e/renderer.js';

// v1.4 Queues — ordered Test Case compositions render to one Playwright spec.
// See `docs/10-team-shareability.md`.
export {
  QUEUE_SCHEMA_VERSION,
  QueueStepSchema,
  QueueInputSchema,
  QueueSchema,
  QueueListSchema,
  queueManifestFilename,
  queueSpecFilename,
  type QueueStep,
  type QueueInput,
  type Queue,
  type QueueList,
} from './library/queue.js';
export {
  renderQueueSpec,
  type RenderQueueSpecArgs,
} from './render/queue/renderer.js';
