/**
 * v1.6.2 — unit tests for the Save-panel Inputs/Outputs helpers.
 */
import { describe, expect, it } from 'vitest';
import type { WorkflowRecording, RecordedEvent } from '@webspec/core/browser';
import {
  attachIOToRecording,
  extractFillEventRows,
  isValidIOName,
  validateIOAuthoring,
} from '../src/popup/io-authoring.js';

function sel(preferred: string) {
  return { preferred, strategy: 'css' as const, fallbacks: [] };
}

function event(kind: RecordedEvent['kind'], extra: Partial<RecordedEvent> = {}): RecordedEvent {
  const base = { t: 0 };
  switch (kind) {
    case 'click':
      return { ...base, kind: 'click', selector: sel('button'), ...extra } as RecordedEvent;
    case 'input':
      return {
        ...base,
        kind: 'input',
        selector: sel('input#x'),
        value: '',
        sensitive: false,
        ...extra,
      } as RecordedEvent;
    case 'change':
      return {
        ...base,
        kind: 'change',
        selector: sel('select#y'),
        value: '',
        ...extra,
      } as RecordedEvent;
    case 'submit':
      return { ...base, kind: 'submit', selector: sel('form'), ...extra } as RecordedEvent;
    case 'navigate':
      return {
        ...base,
        kind: 'navigate',
        url: 'about:blank',
        reason: 'navigate',
        ...extra,
      } as RecordedEvent;
    default:
      return { ...base, kind, ...extra } as RecordedEvent;
  }
}

const RECORDING: WorkflowRecording = {
  name: 'create-lead',
  description: '...',
  runAs: null,
  auth: null,
  startedAt: '2026-05-28T00:00:00Z',
  endedAt: '2026-05-28T00:00:05Z',
  startUrl: 'https://example.test',
  events: [
    event('click'),
    event('input', { selector: sel('input[name=name]'), value: 'Acme Corp', sensitive: false }),
    event('input', { selector: sel('input[type=password]'), value: '***', sensitive: true }),
    event('change', { selector: sel('select#region'), value: 'us-east' }),
    event('submit'),
  ],
  network: [],
  framework: 'playwright',
  inputs: [],
  outputs: [],
};

describe('extractFillEventRows', () => {
  it('returns one row per input/change event, skipping click/submit/navigate', () => {
    const rows = extractFillEventRows(RECORDING);
    expect(rows.map((r) => r.eventIndex)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.kind)).toEqual(['input', 'input', 'change']);
  });

  it('flags password-masked inputs as sensitive', () => {
    const rows = extractFillEventRows(RECORDING);
    expect(rows.find((r) => r.eventIndex === 2)?.sensitive).toBe(true);
    expect(rows.find((r) => r.eventIndex === 1)?.sensitive).toBe(false);
    expect(rows.find((r) => r.eventIndex === 3)?.sensitive).toBe(false);
  });

  it('truncates long selectors for popup display', () => {
    const long = 'div.app > section.lead-form > fieldset > div.row > label > input[name="full-legal-name"]';
    const r: WorkflowRecording = {
      ...RECORDING,
      events: [event('input', { selector: sel(long), value: 'x', sensitive: false })],
    };
    const rows = extractFillEventRows(r);
    expect(rows[0]?.selectorPreview.length).toBeLessThanOrEqual(40);
    expect(rows[0]?.selectorPreview.endsWith('…')).toBe(true);
  });

  it('returns an empty array for a recording with no fill events', () => {
    const r: WorkflowRecording = {
      ...RECORDING,
      events: [event('click'), event('submit')],
    };
    expect(extractFillEventRows(r)).toEqual([]);
  });
});

describe('isValidIOName', () => {
  it.each(['leadName', 'lead_id', '_x', '$ref', 'a1', 'A'])('accepts %s', (s) => {
    expect(isValidIOName(s)).toBe(true);
  });

  it.each(['', ' ', '1abc', 'lead-name', 'lead name', 'lead.id', 'lead!'])('rejects %s', (s) => {
    expect(isValidIOName(s)).toBe(false);
  });
});

describe('validateIOAuthoring', () => {
  it('returns no errors for empty inputs/outputs', () => {
    expect(validateIOAuthoring({ inputs: [], outputs: [] })).toEqual([]);
  });

  it('returns no errors for valid inputs/outputs', () => {
    expect(
      validateIOAuthoring({
        inputs: [{ name: 'leadName', eventIndex: 1 }],
        outputs: [
          { name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } },
          { name: 'leadName', source: { kind: 'text', selector: 'h1.title' } },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects an empty input name', () => {
    const errs = validateIOAuthoring({
      inputs: [{ name: '', eventIndex: 0 }],
      outputs: [],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ scope: 'inputs', index: 0, field: 'name' });
  });

  it('rejects an input name with invalid characters', () => {
    const errs = validateIOAuthoring({
      inputs: [{ name: 'lead-name', eventIndex: 0 }],
      outputs: [],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toMatch(/valid identifier/);
  });

  it('rejects duplicate input names', () => {
    const errs = validateIOAuthoring({
      inputs: [
        { name: 'leadName', eventIndex: 0 },
        { name: 'leadName', eventIndex: 2 },
      ],
      outputs: [],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ scope: 'inputs', index: 1 });
    expect(errs[0]?.message).toMatch(/Duplicate/);
  });

  it('rejects duplicate output names', () => {
    const errs = validateIOAuthoring({
      inputs: [],
      outputs: [
        { name: 'leadId', source: { kind: 'url', pattern: '/x/(\\d+)' } },
        { name: 'leadId', source: { kind: 'text', selector: 'h1' } },
      ],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ scope: 'outputs', index: 1 });
  });

  it('allows the same name on an input and an output', () => {
    expect(
      validateIOAuthoring({
        inputs: [{ name: 'leadName', eventIndex: 0 }],
        outputs: [
          { name: 'leadName', source: { kind: 'text', selector: 'h1' } },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects a URL-source output with an empty pattern', () => {
    const errs = validateIOAuthoring({
      inputs: [],
      outputs: [{ name: 'leadId', source: { kind: 'url', pattern: '   ' } }],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ scope: 'outputs', index: 0, field: 'pattern' });
  });

  it('rejects a text-source output with an empty selector', () => {
    const errs = validateIOAuthoring({
      inputs: [],
      outputs: [{ name: 'leadName', source: { kind: 'text', selector: '' } }],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ scope: 'outputs', index: 0, field: 'selector' });
  });
});

describe('attachIOToRecording', () => {
  it('returns a recording with the supplied inputs and outputs', () => {
    const result = attachIOToRecording(
      RECORDING,
      [{ name: 'leadName', eventIndex: 1 }],
      [{ name: 'leadId', source: { kind: 'url', pattern: '/x/(\\d+)' } }],
    );
    expect(result.inputs).toEqual([{ name: 'leadName', eventIndex: 1 }]);
    expect(result.outputs).toEqual([
      { name: 'leadId', source: { kind: 'url', pattern: '/x/(\\d+)' } },
    ]);
  });

  it('does not mutate the source recording', () => {
    const before = { ...RECORDING };
    attachIOToRecording(RECORDING, [{ name: 'x', eventIndex: 0 }], []);
    expect(RECORDING).toEqual(before);
  });
});
