/**
 * Amazon Bedrock adapter for the LLMProvider interface.
 *
 * The ONLY file in @webspec/core that imports from `@anthropic-ai/bedrock-sdk`.
 * Browser bundles MUST exclude this module — see docs/01-architecture.md.
 *
 * Why Bedrock specifically: Bellese's federal-customer work runs on
 * AWS-resident infrastructure; Anthropic models are accessed via Bedrock
 * with AWS credentials. The direct Anthropic API path is intentionally
 * not shipped — see project memory `project_bedrock.md`.
 *
 * Design notes:
 *   - Auth: standard AWS SDK default credential chain (env vars,
 *     ~/.aws/credentials profile, IAM instance role). The adapter does
 *     not handle credentials directly; the underlying SDK does.
 *   - Structured output via `tools` + `tool_choice` ({type: 'tool', name}),
 *     same as the direct Anthropic API. The zod schema is converted to
 *     JSON Schema and used as the tool's `input_schema`, then the
 *     response is validated against the same zod schema before returning.
 *   - Adaptive thinking + `effort: 'high'` enabled by default. Verify
 *     feature availability for your specific Bedrock model ID — Bedrock
 *     can lag direct-API releases.
 *   - The system prompt (when provided) is sent as a single text block
 *     with `cache_control: 'ephemeral'`. Long stable prefixes cache.
 *   - The Bedrock SDK client is injectable via the constructor so tests
 *     can pass a stubbed client without monkey-patching the SDK.
 */
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { z } from 'zod';
import { LLMValidationError, type CompletionRequest, type LLMProvider } from './provider.js';

/**
 * Default model — a Bedrock cross-region inference profile for Claude Opus.
 * Override via `BedrockAdapterOptions.model` based on what's available in
 * your AWS account. Bedrock model availability lags direct-API releases.
 */
const DEFAULT_MODEL = 'us.anthropic.claude-opus-4-5-20251101-v1:0';
const DEFAULT_MAX_TOKENS = 16_000;
const DEFAULT_EFFORT: 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'high';

export interface BedrockAdapterOptions {
  /** Bedrock model ID (e.g. `us.anthropic.claude-opus-4-5-20251101-v1:0`). Defaults to current Opus cross-region profile. */
  model?: string;
  /** AWS region. Defaults to the SDK's default (`AWS_REGION` env var, then us-east-1). */
  awsRegion?: string;
  /** Per-call ceiling. Individual `complete()` calls can override via `args.maxTokens`. */
  maxTokens?: number;
  /** `output_config.effort`. Defaults to `high`. Verify Bedrock support per model. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Inject a stubbed client for tests. If omitted, a real client is constructed. */
  client?: AnthropicBedrock;
}

export class BedrockAdapter implements LLMProvider {
  readonly providerId: string;
  private readonly client: AnthropicBedrock;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly effort: BedrockAdapterOptions['effort'];

  constructor(opts: BedrockAdapterOptions = {}) {
    this.client =
      opts.client ??
      new AnthropicBedrock(opts.awsRegion ? { awsRegion: opts.awsRegion } : undefined);
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.effort = opts.effort ?? DEFAULT_EFFORT;
    this.providerId = `bedrock:${this.model}`;
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
          // The SDK types `input_schema` as a specific tagged shape; our
          // zod-generated JSON Schema is structurally compatible (we built
          // it from a `z.object(...)`, which produces `{type: 'object', ...}`)
          // but TS can't prove that — cast through unknown to bypass.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: inputSchema as any,
        },
      ],
      tool_choice: { type: 'tool', name: args.schemaName },
    });

    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new LLMValidationError(
        `Bedrock returned no tool_use block (stop_reason=${response.stop_reason}). Expected tool "${args.schemaName}".`,
        this.providerId,
        args.schemaName,
        [],
        response.content,
      );
    }

    if (toolUseBlock.name !== args.schemaName) {
      throw new LLMValidationError(
        `Bedrock returned tool_use for "${toolUseBlock.name}" but expected "${args.schemaName}".`,
        this.providerId,
        args.schemaName,
        [],
        toolUseBlock.input,
      );
    }

    const parsed = args.schema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      throw new LLMValidationError(
        `Bedrock response for "${args.schemaName}" failed zod validation.`,
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
   * Convert a zod schema to the JSON Schema shape Bedrock's `tool.input_schema` expects.
   * Strips the `$schema` declaration zod's converter adds (Bedrock doesn't accept it).
   */
  private toToolInputSchema(schema: z.ZodType): Record<string, unknown> {
    const json = z.toJSONSchema(schema) as Record<string, unknown>;
    const { $schema: _drop, ...bare } = json;
    return bare;
  }
}
