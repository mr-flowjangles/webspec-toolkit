/**
 * Tests for AmplifyAnalyzer. Uses a fake LLMProvider so the suite runs without
 * AWS credentials — same pattern as the M2 TestPlanAnalyzer tests. Live
 * Bedrock verification is gated on AWS access and lives outside this suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { AmplifyAnalyzer } from '../../../src/analyze/amplify/analyzer.js';
import type { LLMProvider } from '../../../src/index.js';
import type {
  AmplifiedRecording,
  WorkflowRecording,
} from '../../../src/index.js';
import { z } from 'zod';

function makeRecording(): WorkflowRecording {
  return {
    startedAt: '2026-05-12T00:00:00.000Z',
    endedAt: '2026-05-12T00:00:10.000Z',
    startUrl: 'https://x.test/login',
    events: [
      {
        t: 100,
        kind: 'input',
        selector: { preferred: 'role=textbox[name="Email"]', strategy: 'role', fallbacks: [] },
        value: 'user@example.com',
        sensitive: false,
      },
      {
        t: 200,
        kind: 'input',
        selector: { preferred: 'role=textbox[name="Password"]', strategy: 'role', fallbacks: [] },
        value: '',
        sensitive: true,
      },
      {
        t: 300,
        kind: 'click',
        selector: { preferred: 'role=button[name="Sign in"]', strategy: 'role', fallbacks: [] },
      },
    ],
    network: [],
    framework: 'playwright',
  };
}

function makeAmplifiedResponse(): AmplifiedRecording {
  const emailSel = { preferred: 'role=textbox[name="Email"]', strategy: 'role' as const, fallbacks: [] };
  const passSel = { preferred: 'role=textbox[name="Password"]', strategy: 'role' as const, fallbacks: [] };
  const signInSel = { preferred: 'role=button[name="Sign in"]', strategy: 'role' as const, fallbacks: [] };
  const errorSel = { preferred: 'role=alert[name="error"]', strategy: 'role' as const, fallbacks: [] };

  return {
    scenarios: [
      {
        kind: 'happy',
        name: 'logs in with valid credentials',
        actions: [
          { kind: 'goto', url: 'https://x.test/login' },
          { kind: 'fill', selector: emailSel, value: 'user@example.com' },
          { kind: 'fill', selector: passSel, value: '' },
          { kind: 'click', selector: signInSel },
        ],
        assertions: [],
      },
      {
        kind: 'negative',
        name: 'rejects empty password',
        actions: [
          { kind: 'goto', url: 'https://x.test/login' },
          { kind: 'fill', selector: emailSel, value: 'user@example.com' },
          { kind: 'click', selector: signInSel },
        ],
        assertions: [
          { kind: 'text', selector: errorSel, mode: 'contains', value: 'required' },
        ],
      },
    ],
  };
}

function fakeProvider(response: AmplifiedRecording): LLMProvider {
  return {
    complete: vi.fn(async () => response),
  } as unknown as LLMProvider;
}

describe('AmplifyAnalyzer.amplify', () => {
  it('returns the LLM response when it validates against the schema', async () => {
    const expected = makeAmplifiedResponse();
    const llm = fakeProvider(expected);
    const analyzer = new AmplifyAnalyzer(llm);

    const result = await analyzer.amplify(makeRecording());

    expect(result).toEqual(expected);
  });

  it('passes the recording through to the LLM as a JSON-stringified user message', async () => {
    const llm = fakeProvider(makeAmplifiedResponse());
    const analyzer = new AmplifyAnalyzer(llm);

    await analyzer.amplify(makeRecording());

    expect(llm.complete).toHaveBeenCalledTimes(1);
    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.system).toContain('Playwright');
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toContain('https://x.test/login');
    expect(call.messages[0].content).toContain('Sign in');
  });

  it('asks the adapter to validate the response against AmplifiedRecordingSchema', async () => {
    const llm = fakeProvider(makeAmplifiedResponse());
    const analyzer = new AmplifyAnalyzer(llm);

    await analyzer.amplify(makeRecording());

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.schemaName).toBe('AmplifiedRecording');
    expect(call.schema).toBeDefined();
    // The schema should accept a valid AmplifiedRecording shape.
    const parse = (call.schema as z.ZodType).safeParse(makeAmplifiedResponse());
    expect(parse.success).toBe(true);
  });

  it('propagates errors thrown by the provider (validation failures, network, etc.)', async () => {
    const llm = {
      complete: vi.fn(async () => {
        throw new Error('LLMValidationError: drift');
      }),
    } as unknown as LLMProvider;
    const analyzer = new AmplifyAnalyzer(llm);

    await expect(analyzer.amplify(makeRecording())).rejects.toThrow('LLMValidationError');
  });
});
