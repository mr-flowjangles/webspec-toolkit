/**
 * v1.6.1 — schema tests for the parametric inputs / declared outputs added to
 * `WorkflowRecording`. The schemas are additive and optional; the most
 * important property to lock is *backward compatibility* — a v1.5.x recording
 * with no `inputs`/`outputs` fields must round-trip cleanly and surface as
 * empty arrays after parse.
 */
import { describe, expect, it } from 'vitest';
import {
  RecordingInputSchema,
  RecordingOutputSchema,
  RecordingOutputSourceSchema,
  WorkflowRecordingSchema,
  type WorkflowRecording,
} from '../../src/types/analysis.js';

const MINIMAL_RECORDING: WorkflowRecording = {
  name: 'create-lead',
  description: 'Creates a lead from the dashboard',
  runAs: null,
  auth: null,
  startedAt: '2026-05-28T00:00:00Z',
  endedAt: '2026-05-28T00:00:10Z',
  startUrl: 'https://example.test/dashboard',
  events: [],
  network: [],
  framework: 'playwright',
  inputs: [],
  outputs: [],
};

describe('RecordingInputSchema', () => {
  it('accepts a valid input declaration', () => {
    expect(
      RecordingInputSchema.safeParse({ name: 'leadName', eventIndex: 0 }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(RecordingInputSchema.safeParse({ name: '', eventIndex: 0 }).success).toBe(false);
  });

  it('rejects a negative eventIndex', () => {
    expect(
      RecordingInputSchema.safeParse({ name: 'x', eventIndex: -1 }).success,
    ).toBe(false);
  });

  it('rejects a non-integer eventIndex', () => {
    expect(
      RecordingInputSchema.safeParse({ name: 'x', eventIndex: 1.5 }).success,
    ).toBe(false);
  });
});

describe('RecordingOutputSourceSchema', () => {
  it('accepts a url source with a pattern', () => {
    expect(
      RecordingOutputSourceSchema.safeParse({ kind: 'url', pattern: '/leads/(\\d+)' }).success,
    ).toBe(true);
  });

  it('accepts a text source with a selector', () => {
    expect(
      RecordingOutputSourceSchema.safeParse({ kind: 'text', selector: 'h1.lead-title' })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown source kind', () => {
    expect(
      RecordingOutputSourceSchema.safeParse({ kind: 'attr', selector: 'h1' }).success,
    ).toBe(false);
  });

  it('rejects an empty url pattern', () => {
    expect(
      RecordingOutputSourceSchema.safeParse({ kind: 'url', pattern: '' }).success,
    ).toBe(false);
  });

  it('rejects an empty text selector', () => {
    expect(
      RecordingOutputSourceSchema.safeParse({ kind: 'text', selector: '' }).success,
    ).toBe(false);
  });
});

describe('RecordingOutputSchema', () => {
  it('accepts a valid url-source output', () => {
    expect(
      RecordingOutputSchema.safeParse({
        name: 'leadId',
        source: { kind: 'url', pattern: '/leads/(\\d+)' },
      }).success,
    ).toBe(true);
  });

  it('accepts a valid text-source output', () => {
    expect(
      RecordingOutputSchema.safeParse({
        name: 'leadName',
        source: { kind: 'text', selector: 'h1.lead-title' },
      }).success,
    ).toBe(true);
  });

  it('rejects an empty output name', () => {
    expect(
      RecordingOutputSchema.safeParse({
        name: '',
        source: { kind: 'url', pattern: '/x/(\\d+)' },
      }).success,
    ).toBe(false);
  });
});

describe('WorkflowRecordingSchema — v1.6 inputs/outputs', () => {
  it('accepts a recording with declared inputs and outputs', () => {
    const r: WorkflowRecording = {
      ...MINIMAL_RECORDING,
      inputs: [{ name: 'leadName', eventIndex: 3 }],
      outputs: [
        { name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } },
        { name: 'leadName', source: { kind: 'text', selector: 'h1.lead-title' } },
      ],
    };
    expect(WorkflowRecordingSchema.safeParse(r).success).toBe(true);
  });

  it('defaults inputs/outputs to [] when absent (v1.5.x backward compat)', () => {
    const { inputs: _i, outputs: _o, ...legacy } = MINIMAL_RECORDING;
    void _i;
    void _o;
    const parsed = WorkflowRecordingSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inputs).toEqual([]);
      expect(parsed.data.outputs).toEqual([]);
    }
  });

  it('rejects an input with an empty name inside the recording', () => {
    const r = {
      ...MINIMAL_RECORDING,
      inputs: [{ name: '', eventIndex: 0 }],
    };
    expect(WorkflowRecordingSchema.safeParse(r).success).toBe(false);
  });

  it('rejects an output with an unknown source kind inside the recording', () => {
    const r = {
      ...MINIMAL_RECORDING,
      outputs: [{ name: 'leadId', source: { kind: 'attr', selector: 'h1' } }],
    };
    expect(WorkflowRecordingSchema.safeParse(r).success).toBe(false);
  });
});
