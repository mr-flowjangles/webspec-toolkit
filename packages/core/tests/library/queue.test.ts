import { describe, expect, it } from 'vitest';
import {
  QueueSchema,
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
});

describe('queueManifestFilename / queueSpecFilename', () => {
  it('formats a manifest filename as queue-<n>-<slug>.json', () => {
    expect(queueManifestFilename(1, 'seed-leads')).toBe('queue-1-seed-leads.json');
  });

  it('formats a spec filename as queue-<n>-<slug>.spec.ts', () => {
    expect(queueSpecFilename(7, 'seed-leads')).toBe('queue-7-seed-leads.spec.ts');
  });
});
