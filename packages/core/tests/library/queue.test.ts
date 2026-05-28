import { describe, expect, it } from 'vitest';
import {
  QueueSchema,
  QueueStepInputValueSchema,
  queueManifestFilename,
  queueSpecFilename,
  type Queue,
} from '../../src/library/queue.js';

const MINIMAL: Queue = {
  schemaVersion: 1,
  id: 'q1',
  name: 'Seed Leads',
  slug: 'seed-leads',
  steps: [{ testCase: 'create-lead', runAs: 'TTIDUMWSUP' }],
  inputs: [],
};

describe('QueueSchema', () => {
  it('accepts a minimal valid Queue', () => {
    expect(QueueSchema.safeParse(MINIMAL).success).toBe(true);
  });

  it('accepts an iterations override on a step', () => {
    const q: Queue = {
      ...MINIMAL,
      steps: [{ testCase: 'create-lead', runAs: 'X', iterations: 100 }],
    };
    expect(QueueSchema.safeParse(q).success).toBe(true);
  });

  it('rejects a Queue with zero steps', () => {
    const q = { ...MINIMAL, steps: [] };
    expect(QueueSchema.safeParse(q).success).toBe(false);
  });

  it('rejects an iterations value of 0', () => {
    const q = {
      ...MINIMAL,
      steps: [{ testCase: 'x', runAs: '', iterations: 0 }],
    };
    expect(QueueSchema.safeParse(q).success).toBe(false);
  });

  it('rejects a non-integer iterations value', () => {
    const q = {
      ...MINIMAL,
      steps: [{ testCase: 'x', runAs: '', iterations: 1.5 }],
    };
    expect(QueueSchema.safeParse(q).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(QueueSchema.safeParse({ ...MINIMAL, name: '' }).success).toBe(false);
  });

  it('rejects an empty slug', () => {
    expect(QueueSchema.safeParse({ ...MINIMAL, slug: '' }).success).toBe(false);
  });

  it('rejects an empty testCase reference on a step', () => {
    const q = { ...MINIMAL, steps: [{ testCase: '', runAs: '' }] };
    expect(QueueSchema.safeParse(q).success).toBe(false);
  });

  it('rejects a schemaVersion mismatch', () => {
    expect(QueueSchema.safeParse({ ...MINIMAL, schemaVersion: 2 }).success).toBe(false);
  });

  it('defaults inputs to []', () => {
    const { inputs: _drop, ...withoutInputs } = MINIMAL;
    void _drop;
    const parsed = QueueSchema.safeParse(withoutInputs);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inputs).toEqual([]);
  });

  it('accepts inputs as name/value pairs', () => {
    const q: Queue = {
      ...MINIMAL,
      inputs: [{ name: 'record_id', value: '42' }],
    };
    expect(QueueSchema.safeParse(q).success).toBe(true);
  });

  it('rejects an input with an empty name', () => {
    const q = { ...MINIMAL, inputs: [{ name: '', value: 'x' }] };
    expect(QueueSchema.safeParse(q).success).toBe(false);
  });

  // v1.6.1 — parametric input wiring on a step.
  it('accepts a step with constant inputValues', () => {
    const q: Queue = {
      ...MINIMAL,
      steps: [
        {
          testCase: 'create-lead',
          runAs: 'X',
          inputValues: { leadName: { mode: 'constant', value: 'Acme Corp' } },
        },
      ],
    };
    expect(QueueSchema.safeParse(q).success).toBe(true);
  });

  it('accepts a step wiring inputValues to an earlier step output', () => {
    const q: Queue = {
      ...MINIMAL,
      steps: [
        { testCase: 'create-lead', runAs: 'X' },
        {
          testCase: 'update-lead',
          runAs: 'X',
          inputValues: {
            leadName: { mode: 'output', step: 1, outputName: 'leadName' },
          },
        },
      ],
    };
    expect(QueueSchema.safeParse(q).success).toBe(true);
  });

  it('accepts a step with no inputValues (back-compat with pre-v1.6 manifests)', () => {
    const q: Queue = {
      ...MINIMAL,
      steps: [{ testCase: 'create-lead', runAs: 'X' }],
    };
    expect(QueueSchema.safeParse(q).success).toBe(true);
  });
});

describe('QueueStepInputValueSchema', () => {
  it('accepts a constant input value', () => {
    expect(
      QueueStepInputValueSchema.safeParse({ mode: 'constant', value: 'Acme' }).success,
    ).toBe(true);
  });

  it('accepts an empty-string constant', () => {
    expect(
      QueueStepInputValueSchema.safeParse({ mode: 'constant', value: '' }).success,
    ).toBe(true);
  });

  it('accepts an output reference', () => {
    expect(
      QueueStepInputValueSchema.safeParse({
        mode: 'output',
        step: 1,
        outputName: 'leadId',
      }).success,
    ).toBe(true);
  });

  it('rejects an output reference with step 0 (steps are 1-based)', () => {
    expect(
      QueueStepInputValueSchema.safeParse({
        mode: 'output',
        step: 0,
        outputName: 'leadId',
      }).success,
    ).toBe(false);
  });

  it('rejects an output reference with an empty outputName', () => {
    expect(
      QueueStepInputValueSchema.safeParse({
        mode: 'output',
        step: 1,
        outputName: '',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown mode', () => {
    expect(
      QueueStepInputValueSchema.safeParse({ mode: 'env', value: 'X' }).success,
    ).toBe(false);
  });
});

describe('queueManifestFilename / queueSpecFilename', () => {
  it('formats a manifest filename as queue-<n>-<slug>.json', () => {
    expect(queueManifestFilename(1, 'seed-leads')).toBe('queue-1-seed-leads.json');
  });

  it('formats a spec filename as queue-<n>-<slug>.spec.ts', () => {
    expect(queueSpecFilename(7, 'seed-leads')).toBe('queue-7-seed-leads.spec.ts');
  });
});
