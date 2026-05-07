/**
 * Contract test for AnthropicAdapter.
 *
 * Asserts the LLMProvider seam contract: given a known prompt and a recorded
 * mock response from the Anthropic SDK, the adapter validates against the zod
 * schema and returns a typed value. No live API calls — the SDK client is
 * stubbed via the constructor's `client` injection.
 *
 * Per docs/02-contract-spec.md, this is the test that pins the seam: any
 * future provider adapter (OpenAI in M8, Bellese-managed proxy if it lands)
 * must satisfy the same interface and a structurally analogous test.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicAdapter, LLMValidationError } from '../../src/index.js';

const FixtureSchema = z.object({
  greeting: z.string(),
  count: z.number().int().nonnegative(),
});

function makeStubClient(response: unknown): {
  client: Anthropic;
  createSpy: ReturnType<typeof vi.fn>;
} {
  const createSpy = vi.fn().mockResolvedValue(response);
  const client = { messages: { create: createSpy } } as unknown as Anthropic;
  return { client, createSpy };
}

const validToolUseResponse = {
  content: [
    {
      type: 'tool_use',
      id: 'toolu_test',
      name: 'Fixture',
      input: { greeting: 'hello', count: 3 },
    },
  ],
  stop_reason: 'tool_use',
};

describe('AnthropicAdapter — happy path', () => {
  it('returns the validated tool_use input on success', async () => {
    const { client } = makeStubClient(validToolUseResponse);
    const adapter = new AnthropicAdapter({ client });

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Greet me' }],
      schema: FixtureSchema,
      schemaName: 'Fixture',
    });

    expect(result).toEqual({ greeting: 'hello', count: 3 });
  });

  it('exposes a stable providerId derived from the model', () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'fake-for-test',
      model: 'claude-sonnet-4-6',
    });
    expect(adapter.providerId).toBe('anthropic:claude-sonnet-4-6');
  });
});

describe('AnthropicAdapter — request shape', () => {
  it('forces tool_choice to the named schema and inlines input_schema (no $schema header)', async () => {
    const { client, createSpy } = makeStubClient(validToolUseResponse);
    const adapter = new AnthropicAdapter({ client });

    await adapter.complete({
      messages: [{ role: 'user', content: 'x' }],
      schema: FixtureSchema,
      schemaName: 'Fixture',
    });

    const calledArgs = createSpy.mock.calls[0]![0];
    expect(calledArgs.tool_choice).toEqual({ type: 'tool', name: 'Fixture' });
    expect(calledArgs.tools).toHaveLength(1);

    const tool = calledArgs.tools[0];
    expect(tool.name).toBe('Fixture');
    expect(tool.input_schema.type).toBe('object');
    expect(tool.input_schema.$schema).toBeUndefined();
    expect(tool.input_schema.properties).toMatchObject({
      greeting: { type: 'string' },
      count: { type: 'integer' },
    });
  });

  it('attaches cache_control to the system prompt when provided', async () => {
    const { client, createSpy } = makeStubClient(validToolUseResponse);
    const adapter = new AnthropicAdapter({ client });

    await adapter.complete({
      system: 'You are an Angular testing assistant.',
      messages: [{ role: 'user', content: 'x' }],
      schema: FixtureSchema,
      schemaName: 'Fixture',
    });

    const calledArgs = createSpy.mock.calls[0]![0];
    expect(calledArgs.system).toEqual([
      {
        type: 'text',
        text: 'You are an Angular testing assistant.',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('omits the system field entirely when no system prompt is given', async () => {
    const { client, createSpy } = makeStubClient(validToolUseResponse);
    const adapter = new AnthropicAdapter({ client });

    await adapter.complete({
      messages: [{ role: 'user', content: 'x' }],
      schema: FixtureSchema,
      schemaName: 'Fixture',
    });

    const calledArgs = createSpy.mock.calls[0]![0];
    expect(calledArgs.system).toBeUndefined();
  });

  it('uses adaptive thinking and effort=high by default', async () => {
    const { client, createSpy } = makeStubClient(validToolUseResponse);
    const adapter = new AnthropicAdapter({ client });

    await adapter.complete({
      messages: [{ role: 'user', content: 'x' }],
      schema: FixtureSchema,
      schemaName: 'Fixture',
    });

    const calledArgs = createSpy.mock.calls[0]![0];
    expect(calledArgs.thinking).toEqual({ type: 'adaptive' });
    expect(calledArgs.output_config).toEqual({ effort: 'high' });
  });

  it('respects a per-call maxTokens override', async () => {
    const { client, createSpy } = makeStubClient(validToolUseResponse);
    const adapter = new AnthropicAdapter({ client, maxTokens: 4_000 });

    await adapter.complete({
      messages: [{ role: 'user', content: 'x' }],
      schema: FixtureSchema,
      schemaName: 'Fixture',
      maxTokens: 8_000,
    });

    const calledArgs = createSpy.mock.calls[0]![0];
    expect(calledArgs.max_tokens).toBe(8_000);
  });
});

describe('AnthropicAdapter — failure modes', () => {
  it('throws LLMValidationError when no tool_use block is present', async () => {
    const { client } = makeStubClient({
      content: [{ type: 'text', text: 'I refuse to call the tool.' }],
      stop_reason: 'end_turn',
    });
    const adapter = new AnthropicAdapter({ client });

    await expect(
      adapter.complete({
        messages: [{ role: 'user', content: 'x' }],
        schema: FixtureSchema,
        schemaName: 'Fixture',
      }),
    ).rejects.toBeInstanceOf(LLMValidationError);
  });

  it('throws LLMValidationError when the tool_use name does not match', async () => {
    const { client } = makeStubClient({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_test',
          name: 'WrongName',
          input: { greeting: 'hi', count: 1 },
        },
      ],
      stop_reason: 'tool_use',
    });
    const adapter = new AnthropicAdapter({ client });

    await expect(
      adapter.complete({
        messages: [{ role: 'user', content: 'x' }],
        schema: FixtureSchema,
        schemaName: 'Fixture',
      }),
    ).rejects.toBeInstanceOf(LLMValidationError);
  });

  it('throws LLMValidationError when the tool_use input fails zod validation', async () => {
    const { client } = makeStubClient({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_test',
          name: 'Fixture',
          input: { greeting: 'hi', count: 'three' },
        },
      ],
      stop_reason: 'tool_use',
    });
    const adapter = new AnthropicAdapter({ client });

    let caught: unknown;
    try {
      await adapter.complete({
        messages: [{ role: 'user', content: 'x' }],
        schema: FixtureSchema,
        schemaName: 'Fixture',
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(LLMValidationError);
    const err = caught as LLMValidationError;
    expect(err.providerId).toBe('anthropic:claude-opus-4-7');
    expect(err.schemaName).toBe('Fixture');
    expect(err.issues.length).toBeGreaterThan(0);
    expect(err.issues[0]!.path).toContain('count');
  });

  it('lets transport errors from the SDK propagate as-is', async () => {
    const transportError = new Error('rate limited');
    const client = {
      messages: { create: vi.fn().mockRejectedValue(transportError) },
    } as unknown as Anthropic;
    const adapter = new AnthropicAdapter({ client });

    await expect(
      adapter.complete({
        messages: [{ role: 'user', content: 'x' }],
        schema: FixtureSchema,
        schemaName: 'Fixture',
      }),
    ).rejects.toBe(transportError);
  });
});
