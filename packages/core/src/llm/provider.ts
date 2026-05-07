/**
 * Vendor-neutral LLM provider seam.
 *
 * Every adapter (Anthropic, OpenAI, future) implements this interface.
 * No vendor SDK may be imported anywhere in the codebase outside its
 * adapter file — see docs/mission.md → "Hard constraints."
 *
 * The interface is structured-output-only by design: the caller passes a
 * zod schema, the adapter routes that to the provider's native structured
 * output mechanism (tool_use for Anthropic, response_format for OpenAI),
 * validates the response against the schema, and returns the typed value.
 * Renderers never see provider quirks.
 */
import type { z } from 'zod';

export type Role = 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface CompletionRequest<S extends z.ZodType> {
  /** Optional system prompt routed to the provider's system field. */
  system?: string;
  /** Conversation history. Most M1+ callers send a single user message. */
  messages: ChatMessage[];
  /** Zod schema for the structured output. The adapter MUST validate before returning. */
  schema: S;
  /** Short identifier for the schema. Providers using named tools (Anthropic) use this as the tool name. */
  schemaName: string;
  /** Optional human description of the schema; passed through to the provider's tool description. */
  schemaDescription?: string;
  /** Hard cap on output tokens. Adapters pick a sane default if omitted. */
  maxTokens?: number;
}

export interface LLMProvider {
  /** Stable identifier for telemetry / cache keys, e.g. "anthropic:claude-sonnet-4-6". */
  readonly providerId: string;

  /**
   * Run a structured-output completion. Returns the validated, typed value.
   *
   * Throws on:
   *   - provider transport errors (network, auth, rate limit) — surfaced as-is
   *   - schema validation failure — surfaced as a `LLMValidationError`
   */
  complete<S extends z.ZodType>(args: CompletionRequest<S>): Promise<z.infer<S>>;
}

/**
 * Thrown when the provider's response can't be parsed against the requested schema.
 * Surface this distinctly from network errors so callers can decide whether to retry.
 */
export class LLMValidationError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly schemaName: string,
    public readonly issues: readonly { path: (string | number)[]; message: string }[],
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'LLMValidationError';
  }
}
