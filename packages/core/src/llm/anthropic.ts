/**
 * Anthropic adapter for the LLMProvider interface.
 *
 * The ONLY file in @bellese/test-core that imports from `@anthropic-ai/sdk`.
 * Browser bundles MUST exclude this module — see docs/01-architecture.md.
 *
 * Design notes:
 *   - Structured output via `tools` + `tool_choice` ({type: 'tool', name}).
 *     The zod schema is converted to JSON Schema and used as the tool's
 *     `input_schema`, then the response is validated against the same zod
 *     schema before returning. Renderers never see provider quirks.
 *   - Adaptive thinking is enabled by default. Test generation is
 *     intelligence-sensitive; cost is bounded by the configured `effort`.
 *   - The system prompt (when provided) is sent as a single text block with
 *     `cache_control: 'ephemeral'`. Long, stable system prompts (project
 *     conventions, few-shot examples) cache across requests; per-call
 *     volatile content goes in the user message, not in `system`.
 *   - The Anthropic SDK client is injectable via the constructor so tests
 *     can pass a stubbed client without monkey-patching the SDK.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { LLMValidationError, type CompletionRequest, type LLMProvider } from './provider.js';

const DEFAULT_MODEL = 'claude-opus-4-7';
const DEFAULT_MAX_TOKENS = 16_000;
const DEFAULT_EFFORT: 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'high';

export interface AnthropicAdapterOptions {
  /** Reads `process.env.ANTHROPIC_API_KEY` if omitted. Ignored when `client` is supplied. */
  apiKey?: string;
  /** Defaults to `claude-opus-4-7`. */
  model?: string;
  /** Per-call ceiling. Individual `complete()` calls can override via `args.maxTokens`. */
  maxTokens?: number;
  /** `output_config.effort`. Defaults to `high`. Supported on Opus 4.5+ and Sonnet 4.6 only. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Inject a stubbed client for tests. If omitted, a real client is constructed from `apiKey`. */
  client?: Anthropic;
}

export class AnthropicAdapter implements LLMProvider {
  readonly providerId: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly effort: AnthropicAdapterOptions['effort'];

  constructor(opts: AnthropicAdapterOptions = {}) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.effort = opts.effort ?? DEFAULT_EFFORT;
    this.providerId = `anthropic:${this.model}`;
  }

  async complete<S extends z.ZodType>(args: CompletionRequest<S>): Promise<z.infer<S>> {
    const inputSchema = this.toToolInputSchema(args.schema);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: args.maxTokens ?? this.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: this.effort },
      ...(args.system
        ? {
            system: [
              {
                type: 'text' as const,
                text: args.system,
                cache_control: { type: 'ephemeral' as const },
              },
            ],
          }
        : {}),
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [
        {
          name: args.schemaName,
          description:
            args.schemaDescription ?? `Return data conforming to the ${args.schemaName} schema.`,
          input_schema: inputSchema as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: args.schemaName },
    });

    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new LLMValidationError(
        `Anthropic returned no tool_use block (stop_reason=${response.stop_reason}). Expected tool "${args.schemaName}".`,
        this.providerId,
        args.schemaName,
        [],
        response.content,
      );
    }

    if (toolUseBlock.name !== args.schemaName) {
      throw new LLMValidationError(
        `Anthropic returned tool_use for "${toolUseBlock.name}" but expected "${args.schemaName}".`,
        this.providerId,
        args.schemaName,
        [],
        toolUseBlock.input,
      );
    }

    const parsed = args.schema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      throw new LLMValidationError(
        `Anthropic response for "${args.schemaName}" failed zod validation.`,
        this.providerId,
        args.schemaName,
        parsed.error.issues.map((i) => ({
          path: i.path as (string | number)[],
          message: i.message,
        })),
        toolUseBlock.input,
      );
    }

    return parsed.data;
  }

  /**
   * Convert a zod schema to the JSON Schema shape Anthropic's `tool.input_schema` expects.
   * Strips the `$schema` declaration zod's converter adds (Anthropic doesn't accept it).
   */
  private toToolInputSchema(schema: z.ZodType): Record<string, unknown> {
    const json = z.toJSONSchema(schema) as Record<string, unknown>;
    const { $schema: _drop, ...bare } = json;
    return bare;
  }
}
