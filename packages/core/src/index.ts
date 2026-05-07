// @bellese/test-core — shared analyzer + renderer + LLM provider seam.
// Phase 1 analyzers (test-plan, a11y, recorder) and Phase 2 renderers
// (test, report, e2e) land in their respective milestones (M2, M4, M6).

export const PACKAGE_NAME = '@bellese/test-core';

// Contract artifact — the typed shape every analyzer produces and every renderer consumes.
export * from './types/analysis.js';

// LLM provider seam — vendor-neutral interface + Anthropic adapter.
// IMPORTANT: this module imports `@anthropic-ai/sdk`. Browser bundles
// (Chrome extension) must exclude `./llm/anthropic.js` from their entry
// graph. The interface in `./llm/provider.js` is browser-safe.
export type { ChatMessage, CompletionRequest, LLMProvider, Role } from './llm/provider.js';
export { LLMValidationError } from './llm/provider.js';
export { AnthropicAdapter, type AnthropicAdapterOptions } from './llm/anthropic.js';
