/**
 * Tests for the amplifier prompt. Snapshot-style — the system prompt is long
 * but stable, so we assert the load-bearing instructions are present rather
 * than diff-matching the whole string.
 */
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, formatUserPrompt } from '../../../src/analyze/amplify/prompt.js';
import type { WorkflowRecording } from '../../../src/index.js';

describe('SYSTEM_PROMPT', () => {
  it('frames the model as a Playwright test author', () => {
    expect(SYSTEM_PROMPT).toContain('Playwright');
    expect(SYSTEM_PROMPT).toContain('WorkflowRecording');
    expect(SYSTEM_PROMPT).toContain('AmplifiedRecording');
  });

  it('requires exactly one happy scenario and 2–4 negatives', () => {
    expect(SYSTEM_PROMPT).toContain('One happy scenario');
    expect(SYSTEM_PROMPT).toContain('2–4 negative scenarios');
  });

  it('lists every negative archetype', () => {
    expect(SYSTEM_PROMPT).toContain('Empty required field');
    expect(SYSTEM_PROMPT).toContain('Invalid format');
    expect(SYSTEM_PROMPT).toContain('Wrong credentials');
    expect(SYSTEM_PROMPT).toContain('Out-of-order action');
    expect(SYSTEM_PROMPT).toContain('Boundary case');
  });

  it('lists every action and assertion kind allowed in the IR', () => {
    for (const kind of [
      'click',
      'fill',
      'press',
      'goto',
      'reload',
      'waitForURL',
      'selectOption',
      'check',
      'uncheck',
    ]) {
      expect(SYSTEM_PROMPT).toContain(`\`${kind}\``);
    }
    for (const kind of ['visible', 'hidden', 'text', 'url', 'count', 'value', 'checked']) {
      expect(SYSTEM_PROMPT).toContain(`\`${kind}\``);
    }
  });

  it('forbids fabricated selectors and happy-scenario drift', () => {
    expect(SYSTEM_PROMPT).toContain('No fabricated selectors');
    expect(SYSTEM_PROMPT).toContain('No happy-scenario drift');
    expect(SYSTEM_PROMPT).toContain('No exhaustive fuzzing');
  });

  it('maps each navigate.reason to a renderer-compatible action', () => {
    expect(SYSTEM_PROMPT).toContain('"reload"');
    expect(SYSTEM_PROMPT).toContain('"navigate"');
    expect(SYSTEM_PROMPT).toContain('"history"');
    expect(SYSTEM_PROMPT).toContain('"hash"');
    expect(SYSTEM_PROMPT).toContain('waitForURL');
  });
});

describe('formatUserPrompt', () => {
  it('embeds the recording JSON in a fenced code block', () => {
    const recording: WorkflowRecording = {
      startedAt: '2026-05-12T00:00:00.000Z',
      endedAt: '2026-05-12T00:00:10.000Z',
      startUrl: 'https://example.com',
      events: [
        {
          t: 100,
          kind: 'click',
          selector: { preferred: 'role=button[name="Save"]', strategy: 'role', fallbacks: [] },
        },
      ],
      network: [],
      framework: 'playwright',
    };
    const prompt = formatUserPrompt(recording);
    expect(prompt).toContain('```json');
    expect(prompt).toContain('"startUrl": "https://example.com"');
    expect(prompt).toContain('"kind": "click"');
    expect(prompt).toContain('"preferred": "role=button[name=\\"Save\\"]"');
  });
});
