/**
 * v1.7.2 — unit tests for the auto-propose helper. Confirms which events
 * promote and which don't, the name-derivation precedence order, and
 * name uniquification across multiple identical fields.
 */
import { describe, expect, it } from 'vitest';
import type { HardenedSelector, RecordedEvent, WorkflowRecording } from '@webspec/core/browser';
import {
  isPromotable,
  proposeInputsFromRecording,
  proposeOutputsFromRecording,
  suggestNameFromSelector,
} from '../src/popup/io-proposal.js';

function sel(preferred: string): HardenedSelector {
  return { preferred, strategy: 'css', fallbacks: [] };
}

function recording(events: RecordedEvent[]): WorkflowRecording {
  return {
    name: 'test',
    description: 't',
    runAs: null,
    auth: null,
    startedAt: '2026-05-28T00:00:00Z',
    endedAt: '2026-05-28T00:00:05Z',
    startUrl: 'https://example.test',
    events,
    network: [],
    framework: 'playwright',
    inputs: [],
    outputs: [],
  };
}

describe('suggestNameFromSelector', () => {
  it('prefers role-based [name="…"] human label', () => {
    expect(suggestNameFromSelector(sel('role=textbox[name="Lead Name"]'))).toBe('leadName');
  });

  it('falls back to #id', () => {
    expect(suggestNameFromSelector(sel('#lead-name'))).toBe('leadName');
  });

  it('extracts data-* attribute value', () => {
    expect(suggestNameFromSelector(sel('[data-test-id="email-field"]'))).toBe('emailField');
  });

  it('extracts plain [name="…"]', () => {
    expect(suggestNameFromSelector(sel('input[name="lead_name"]'))).toBe('leadName');
  });

  it('extracts [placeholder="…"]', () => {
    expect(suggestNameFromSelector(sel('input[placeholder="Enter email"]'))).toBe('enterEmail');
  });

  it('returns "input" when no candidate matches', () => {
    expect(suggestNameFromSelector(sel('div.unknown > span:nth-child(3)'))).toBe('input');
  });

  it('forces a leading letter when the source starts with a digit', () => {
    expect(suggestNameFromSelector(sel('[name="2 Name"]'))).toMatch(/^[A-Za-z_$]/);
  });

  it('handles empty-string captures by returning fallback', () => {
    expect(suggestNameFromSelector(sel('[name=""]'))).toBe('input');
  });
});

describe('isPromotable', () => {
  it('accepts non-sensitive input with a value', () => {
    expect(
      isPromotable({
        t: 0,
        kind: 'input',
        selector: sel('input'),
        value: 'x',
        sensitive: false,
      }),
    ).toBe(true);
  });

  it('rejects sensitive input', () => {
    expect(
      isPromotable({
        t: 0,
        kind: 'input',
        selector: sel('input'),
        value: 'secret',
        sensitive: true,
      }),
    ).toBe(false);
  });

  it('rejects empty-value input', () => {
    expect(
      isPromotable({
        t: 0,
        kind: 'input',
        selector: sel('input'),
        value: '',
        sensitive: false,
      }),
    ).toBe(false);
  });

  it('accepts select-change (options !== undefined) with a value', () => {
    expect(
      isPromotable({
        t: 0,
        kind: 'change',
        selector: sel('select'),
        value: 'us',
        options: [{ value: 'us', label: 'United States' }],
      }),
    ).toBe(true);
  });

  it('rejects checkbox/radio change (options === undefined)', () => {
    expect(
      isPromotable({
        t: 0,
        kind: 'change',
        selector: sel('input[type=checkbox]'),
        value: 'true',
      }),
    ).toBe(false);
  });

  it('rejects non-fill event kinds', () => {
    expect(isPromotable({ t: 0, kind: 'click', selector: sel('button') })).toBe(false);
    expect(
      isPromotable({ t: 0, kind: 'submit', selector: sel('form') }),
    ).toBe(false);
  });
});

describe('proposeInputsFromRecording', () => {
  it('returns one input per promotable event', () => {
    const r = recording([
      { t: 0, kind: 'click', selector: sel('button') },
      {
        t: 1,
        kind: 'input',
        selector: sel('[name="email"]'),
        value: 'user@example.com',
        sensitive: false,
      },
      {
        t: 2,
        kind: 'change',
        selector: sel('[name="country"]'),
        value: 'us',
        options: [{ value: 'us', label: 'US' }],
      },
    ]);
    const proposed = proposeInputsFromRecording(r);
    expect(proposed.map((i) => i.eventIndex)).toEqual([1, 2]);
  });

  it('skips sensitive, empty, and checkbox events', () => {
    const r = recording([
      {
        t: 0,
        kind: 'input',
        selector: sel('input[type=password]'),
        value: 'pw',
        sensitive: true,
      },
      {
        t: 1,
        kind: 'input',
        selector: sel('[name="empty"]'),
        value: '',
        sensitive: false,
      },
      {
        t: 2,
        kind: 'change',
        selector: sel('[type=checkbox]'),
        value: 'true',
      },
    ]);
    expect(proposeInputsFromRecording(r)).toEqual([]);
  });

  it('uniquifies names when two events have the same suggested base', () => {
    const r = recording([
      {
        t: 0,
        kind: 'input',
        selector: sel('[name="name"]'),
        value: 'one',
        sensitive: false,
      },
      {
        t: 1,
        kind: 'input',
        selector: sel('[name="name"]'),
        value: 'two',
        sensitive: false,
      },
      {
        t: 2,
        kind: 'input',
        selector: sel('[name="name"]'),
        value: 'three',
        sensitive: false,
      },
    ]);
    const proposed = proposeInputsFromRecording(r);
    expect(proposed.map((i) => i.name)).toEqual(['name', 'name2', 'name3']);
  });

  it('returns the suggested names from the lead-form fixture shape', () => {
    const r = recording([
      {
        t: 0,
        kind: 'input',
        selector: sel('role=textbox[name="Lead Name"]'),
        value: 'Acme Corp',
        sensitive: false,
      },
    ]);
    const proposed = proposeInputsFromRecording(r);
    expect(proposed).toEqual([{ name: 'leadName', eventIndex: 0 }]);
  });
});

describe('proposeOutputsFromRecording', () => {
  function nav(url: string, reason: 'navigate' | 'reload' | 'history' | 'hash' = 'history') {
    return { t: 100, kind: 'navigate' as const, url, reason };
  }

  function recordingWithNav(start: string, navUrls: string[]): WorkflowRecording {
    return {
      ...recording([]),
      startUrl: start,
      events: navUrls.map((u, i) => ({ ...nav(u), t: 100 + i })),
    };
  }

  it('returns [] when there are no navigate events', () => {
    expect(proposeOutputsFromRecording(recording([]))).toEqual([]);
  });

  it('returns [] when the final URL equals startUrl', () => {
    const r = recordingWithNav('http://x.test/page', ['http://x.test/page']);
    expect(proposeOutputsFromRecording(r)).toEqual([]);
  });

  it('proposes a hash-route URL output from the lead-form shape', () => {
    const r = recordingWithNav(
      'http://localhost:8765/lead-form.html',
      ['http://localhost:8765/lead-form.html#/lead/1'],
    );
    expect(proposeOutputsFromRecording(r)).toEqual([
      { name: 'leadId', source: { kind: 'url', pattern: '#/lead/(\\d+)' } },
    ]);
  });

  it('proposes a path-segment URL output for /leads/123', () => {
    const r = recordingWithNav('https://app.test/dashboard', ['https://app.test/leads/123']);
    expect(proposeOutputsFromRecording(r)).toEqual([
      { name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } },
    ]);
  });

  it('singularizes pluralized context words', () => {
    const r = recordingWithNav('https://app.test/', ['https://app.test/categories/42']);
    expect(proposeOutputsFromRecording(r)[0]?.name).toBe('categoryId');
  });

  it('proposes multiple outputs for nested ID segments', () => {
    const r = recordingWithNav(
      'https://app.test/',
      ['https://app.test/users/7/posts/100'],
    );
    const proposed = proposeOutputsFromRecording(r);
    expect(proposed).toEqual([
      { name: 'userId', source: { kind: 'url', pattern: '/users/(\\d+)' } },
      { name: 'postId', source: { kind: 'url', pattern: '/posts/(\\d+)' } },
    ]);
  });

  it('skips ID segments that already existed in the start URL', () => {
    // Recording starts on /leads/42, navigates within it — no new ID
    // introduced, so no proposal.
    const r = recordingWithNav('https://app.test/leads/42', ['https://app.test/leads/42/edit']);
    expect(proposeOutputsFromRecording(r)).toEqual([]);
  });

  it('uniquifies when two paths yield the same name', () => {
    const r = recordingWithNav(
      'https://app.test/',
      ['https://app.test/leads/1/leads/2'],
    );
    const proposed = proposeOutputsFromRecording(r);
    expect(proposed.map((o) => o.name)).toEqual(['leadId', 'leadId2']);
  });

  it('uses the last navigate event as the final URL', () => {
    const r = recordingWithNav(
      'https://app.test/start',
      [
        'https://app.test/middle/1', // intermediate — not used for proposal
        'https://app.test/end/42', // final
      ],
    );
    const proposed = proposeOutputsFromRecording(r);
    expect(proposed.map((o) => o.source)).toEqual([
      { kind: 'url', pattern: '/end/(\\d+)' },
    ]);
  });

  it('ignores non-numeric ID-like segments (UUIDs etc.) — heuristic-only MVP', () => {
    const r = recordingWithNav(
      'https://app.test/',
      ['https://app.test/items/a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    );
    expect(proposeOutputsFromRecording(r)).toEqual([]);
  });
});
