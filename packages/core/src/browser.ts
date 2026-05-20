/**
 * Browser-safe entry point for `@webspec/core`.
 *
 * Re-exports only modules that are safe to bundle into a browser context
 * (Chrome extension popup + content script). Node-only modules — the Bedrock
 * adapter (`@anthropic-ai/bedrock-sdk`), the TestPlan parser (`ts-morph`),
 * the Puppeteer-driven `A11yAnalyzer` — are deliberately excluded.
 *
 * Resolves via the package.json `exports` map: `import { ... } from '@webspec/core/browser'`.
 */

// Contract artifact — types + zod schemas. Pure, no platform deps.
export * from './types/analysis.js';

// LLM provider seam interface only (no Bedrock adapter). The interface itself
// is browser-safe; concrete adapters that import AWS/Anthropic SDKs are not.
export type { ChatMessage, CompletionRequest, LLMProvider, Role } from './llm/provider.js';
export { LLMValidationError } from './llm/provider.js';

// A11y normalize — pure function `AxeResults → A11yReport`. The browser
// imports axe-core directly to produce the AxeResults itself, then calls
// this to normalize.
export { normalizeAxeResults, type NormalizeTarget } from './analyze/a11y/normalize.js';

// Phase 2 renderers — pure string-op functions.
export { renderTestPlan } from './render/test/renderer.js';
export {
  renderA11yReportMarkdown,
  renderA11yReportJson,
} from './render/a11y/renderer.js';
export {
  renderPlaywrightSpec,
  renderAmplifiedPlaywrightSpec,
  type RenderE2EOptions,
} from './render/e2e/renderer.js';

// Test library — slug derivation for the v1.2 on-disk layout
// (~/Downloads/webspec/<slug>/). See docs/08-test-library.md.
export { deriveSlug } from './library/slug.js';

// v1.3 auth profiles — match the active tab's URL against configured profiles
// and resolve `${runAs}` placeholders into ready-to-emit HTTP headers.
export {
  AuthHeaderSchema,
  AuthProfileSchema,
  AuthProfileListSchema,
  matchProfile,
  resolveProfileHeaders,
  type AuthHeader,
  type AuthProfile,
  type AuthProfileList,
} from './library/auth-profile.js';
export { matchesUrlGlob } from './library/url-glob.js';

// v1.4 Queues — ordered Test Case compositions that render to one Playwright
// spec per Queue. See `docs/10-team-shareability.md`.
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
