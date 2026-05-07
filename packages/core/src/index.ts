// @bellese/test-core — shared analyzer + renderer + LLM provider seam.
// Phase 1 analyzers (test-plan, a11y, recorder) and Phase 2 renderers
// (test, report, e2e) land in their respective milestones (M2, M4, M6).

export const PACKAGE_NAME = '@bellese/test-core';

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

// Phase 2 — TestRenderer (TestPlan → Jest .spec.ts text). Pure function;
// browser-safe (uses string ops, no Node `path`).
export { renderTestPlan } from './render/test/renderer.js';
