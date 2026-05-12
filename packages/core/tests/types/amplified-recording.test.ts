/**
 * Zod-validation tests for AmplifiedRecording. Confirms that the schema
 * accepts the shapes the M6 amplifier (v0.7.2) is allowed to produce, and
 * rejects shapes that would silently corrupt the renderer downstream.
 */
import { describe, it, expect } from 'vitest';
import {
  AmplifiedRecordingSchema,
  AmplifiedScenarioSchema,
  AmplifiedActionSchema,
  AmplifiedAssertionSchema,
} from '../../src/types/analysis.js';

const selector = {
  preferred: 'role=button[name="Save"]',
  strategy: 'role' as const,
  fallbacks: [],
};

describe('AmplifiedActionSchema', () => {
  it('accepts click', () => {
    expect(AmplifiedActionSchema.safeParse({ kind: 'click', selector }).success).toBe(true);
  });

  it('accepts fill with a value', () => {
    expect(
      AmplifiedActionSchema.safeParse({ kind: 'fill', selector, value: 'hello' }).success,
    ).toBe(true);
  });

  it('accepts press with a key', () => {
    expect(
      AmplifiedActionSchema.safeParse({ kind: 'press', selector, key: 'Enter' }).success,
    ).toBe(true);
  });

  it('accepts goto with a url', () => {
    expect(
      AmplifiedActionSchema.safeParse({ kind: 'goto', url: 'https://example.com' }).success,
    ).toBe(true);
  });

  it('accepts reload (no extra fields)', () => {
    expect(AmplifiedActionSchema.safeParse({ kind: 'reload' }).success).toBe(true);
  });

  it('accepts waitForURL with a url', () => {
    expect(
      AmplifiedActionSchema.safeParse({ kind: 'waitForURL', url: 'https://example.com/next' })
        .success,
    ).toBe(true);
  });

  it('accepts selectOption', () => {
    expect(
      AmplifiedActionSchema.safeParse({ kind: 'selectOption', selector, value: 'ca' }).success,
    ).toBe(true);
  });

  it('accepts check and uncheck', () => {
    expect(AmplifiedActionSchema.safeParse({ kind: 'check', selector }).success).toBe(true);
    expect(AmplifiedActionSchema.safeParse({ kind: 'uncheck', selector }).success).toBe(true);
  });

  it('rejects unknown action kind', () => {
    expect(AmplifiedActionSchema.safeParse({ kind: 'dblclick', selector }).success).toBe(false);
  });

  it('rejects fill missing value', () => {
    expect(AmplifiedActionSchema.safeParse({ kind: 'fill', selector }).success).toBe(false);
  });

  it('rejects goto missing url', () => {
    expect(AmplifiedActionSchema.safeParse({ kind: 'goto' }).success).toBe(false);
  });
});

describe('AmplifiedAssertionSchema', () => {
  it('accepts visible/hidden', () => {
    expect(AmplifiedAssertionSchema.safeParse({ kind: 'visible', selector }).success).toBe(true);
    expect(AmplifiedAssertionSchema.safeParse({ kind: 'hidden', selector }).success).toBe(true);
  });

  it('accepts text in equals mode', () => {
    expect(
      AmplifiedAssertionSchema.safeParse({
        kind: 'text',
        selector,
        mode: 'equals',
        value: 'Saved',
      }).success,
    ).toBe(true);
  });

  it('accepts text in contains mode', () => {
    expect(
      AmplifiedAssertionSchema.safeParse({
        kind: 'text',
        selector,
        mode: 'contains',
        value: 'Saved',
      }).success,
    ).toBe(true);
  });

  it('rejects text with an invalid mode', () => {
    expect(
      AmplifiedAssertionSchema.safeParse({
        kind: 'text',
        selector,
        mode: 'startsWith',
        value: 'foo',
      }).success,
    ).toBe(false);
  });

  it('accepts url, count, value, checked', () => {
    expect(
      AmplifiedAssertionSchema.safeParse({ kind: 'url', value: 'https://example.com/x' }).success,
    ).toBe(true);
    expect(
      AmplifiedAssertionSchema.safeParse({ kind: 'count', selector, value: 3 }).success,
    ).toBe(true);
    expect(
      AmplifiedAssertionSchema.safeParse({ kind: 'value', selector, value: 'abc' }).success,
    ).toBe(true);
    expect(AmplifiedAssertionSchema.safeParse({ kind: 'checked', selector }).success).toBe(true);
  });

  it('rejects negative count', () => {
    expect(
      AmplifiedAssertionSchema.safeParse({ kind: 'count', selector, value: -1 }).success,
    ).toBe(false);
  });

  it('rejects non-integer count', () => {
    expect(
      AmplifiedAssertionSchema.safeParse({ kind: 'count', selector, value: 1.5 }).success,
    ).toBe(false);
  });
});

describe('AmplifiedScenarioSchema', () => {
  it('accepts a minimal happy scenario', () => {
    const result = AmplifiedScenarioSchema.safeParse({
      kind: 'happy',
      name: 'logs in successfully',
      actions: [{ kind: 'click', selector }],
      assertions: [{ kind: 'visible', selector }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a negative scenario with description', () => {
    const result = AmplifiedScenarioSchema.safeParse({
      kind: 'negative',
      name: 'rejects empty form',
      description: 'Click submit with no fields filled — error message visible.',
      actions: [{ kind: 'click', selector }],
      assertions: [{ kind: 'text', selector, mode: 'contains', value: 'required' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = AmplifiedScenarioSchema.safeParse({
      kind: 'happy',
      name: '',
      actions: [],
      assertions: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown kind', () => {
    const result = AmplifiedScenarioSchema.safeParse({
      kind: 'edge-case',
      name: 'x',
      actions: [],
      assertions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('AmplifiedRecordingSchema', () => {
  it('requires at least one scenario', () => {
    expect(AmplifiedRecordingSchema.safeParse({ scenarios: [] }).success).toBe(false);
  });

  it('accepts a recording with multiple scenarios', () => {
    const result = AmplifiedRecordingSchema.safeParse({
      scenarios: [
        {
          kind: 'happy',
          name: 'logs in',
          actions: [{ kind: 'click', selector }],
          assertions: [],
        },
        {
          kind: 'negative',
          name: 'wrong password',
          actions: [{ kind: 'fill', selector, value: 'wrong' }],
          assertions: [{ kind: 'visible', selector }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
