/**
 * v1.6.3 — unit tests for the Queue composer's wiring helpers.
 */
import { describe, expect, it } from 'vitest';
import type { QueueStepInputValue } from '@webspec/core/browser';
import {
  autoWireInputs,
  availableOutputSources,
  buildInputValuesForStep,
  validateStepWiring,
  type ComposerStepView,
} from '../src/settings/queue-input-wiring.js';

function step(opts: {
  slug: string;
  iterations?: number;
  inputs?: { name: string; eventIndex: number }[];
  outputs?: string[];
}): ComposerStepView {
  return {
    testCaseSlug: opts.slug,
    iterations: opts.iterations ?? 1,
    testCaseInputs: opts.inputs ?? [],
    testCaseOutputs: (opts.outputs ?? []).map((name) => ({
      name,
      source: { kind: 'text' as const, selector: `[data-${name}]` },
    })),
  };
}

describe('availableOutputSources', () => {
  it('returns no sources for the first step', () => {
    const steps = [step({ slug: 'a', outputs: ['x'] })];
    expect(availableOutputSources(steps, 0)).toEqual([]);
  });

  it('returns each earlier non-iterated step\'s outputs in order', () => {
    const steps = [
      step({ slug: 'create-lead', outputs: ['leadId', 'leadName'] }),
      step({ slug: 'fetch-detail', outputs: ['detailId'] }),
      step({ slug: 'update-lead' }),
    ];
    expect(availableOutputSources(steps, 2)).toEqual([
      { step: 1, testCaseSlug: 'create-lead', outputName: 'leadId' },
      { step: 1, testCaseSlug: 'create-lead', outputName: 'leadName' },
      { step: 2, testCaseSlug: 'fetch-detail', outputName: 'detailId' },
    ]);
  });

  it('hides iterated earlier steps', () => {
    const steps = [
      step({ slug: 'seed', iterations: 100, outputs: ['leadId'] }),
      step({ slug: 'final-update' }),
    ];
    expect(availableOutputSources(steps, 1)).toEqual([]);
  });

  it('excludes the current step and any later step', () => {
    const steps = [
      step({ slug: 'a', outputs: ['x'] }),
      step({ slug: 'b', outputs: ['y'] }),
      step({ slug: 'c', outputs: ['z'] }),
    ];
    expect(availableOutputSources(steps, 1).map((s) => s.outputName)).toEqual(['x']);
  });
});

describe('validateStepWiring', () => {
  function constant(value: string): QueueStepInputValue {
    return { mode: 'constant', value };
  }
  function output(s: number, name: string): QueueStepInputValue {
    return { mode: 'output', step: s, outputName: name };
  }

  it('returns no errors when the step has no declared inputs', () => {
    const steps = [step({ slug: 'a' }), step({ slug: 'b' })];
    expect(validateStepWiring(steps, 1, {})).toEqual([]);
  });

  it('flags an undeclared input wiring (missing key)', () => {
    const steps = [
      step({ slug: 'a' }),
      step({ slug: 'b', inputs: [{ name: 'leadName', eventIndex: 0 }] }),
    ];
    const errs = validateStepWiring(steps, 1, {});
    expect(errs).toHaveLength(1);
    expect(errs[0]?.kind).toBe('unwired-input');
  });

  it('accepts a constant wiring (including empty-string)', () => {
    const steps = [
      step({ slug: 'a' }),
      step({ slug: 'b', inputs: [{ name: 'leadName', eventIndex: 0 }] }),
    ];
    expect(validateStepWiring(steps, 1, { leadName: constant('Acme') })).toEqual([]);
    expect(validateStepWiring(steps, 1, { leadName: constant('') })).toEqual([]);
  });

  it('accepts a valid output reference', () => {
    const steps = [
      step({ slug: 'create-lead', outputs: ['leadName'] }),
      step({ slug: 'update-lead', inputs: [{ name: 'leadName', eventIndex: 0 }] }),
    ];
    expect(
      validateStepWiring(steps, 1, { leadName: output(1, 'leadName') }),
    ).toEqual([]);
  });

  it('rejects an output reference to step 0 (1-based)', () => {
    const steps = [
      step({ slug: 'b', inputs: [{ name: 'x', eventIndex: 0 }] }),
    ];
    const errs = validateStepWiring(steps, 0, { x: output(0, 'x') });
    expect(errs).toHaveLength(1);
    expect(errs[0]?.kind).toBe('invalid-output-reference');
  });

  it('rejects an output reference to the current step', () => {
    const steps = [
      step({ slug: 'a', outputs: ['x'] }),
      step({ slug: 'b', inputs: [{ name: 'x', eventIndex: 0 }] }),
    ];
    const errs = validateStepWiring(steps, 1, { x: output(2, 'x') });
    expect(errs).toHaveLength(1);
    expect(errs[0]?.kind).toBe('invalid-output-reference');
  });

  it('rejects an output reference whose target step is iterated', () => {
    const steps = [
      step({ slug: 'seed', iterations: 3, outputs: ['leadId'] }),
      step({ slug: 'final', inputs: [{ name: 'leadId', eventIndex: 0 }] }),
    ];
    const errs = validateStepWiring(steps, 1, { leadId: output(1, 'leadId') });
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toMatch(/iterated/);
  });

  it('rejects an output reference to an output the target step does not declare', () => {
    const steps = [
      step({ slug: 'a', outputs: ['leadName'] }),
      step({ slug: 'b', inputs: [{ name: 'leadId', eventIndex: 0 }] }),
    ];
    const errs = validateStepWiring(steps, 1, { leadId: output(1, 'leadId') });
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toMatch(/does not declare/);
  });

  it('accumulates multiple errors when several inputs are misconfigured', () => {
    const steps = [
      step({ slug: 'a', outputs: ['leadName'] }),
      step({
        slug: 'b',
        inputs: [
          { name: 'leadId', eventIndex: 0 },
          { name: 'leadName', eventIndex: 1 },
        ],
      }),
    ];
    const errs = validateStepWiring(steps, 1, {
      leadId: output(1, 'leadId'),
      // leadName not wired
    });
    expect(errs).toHaveLength(2);
  });
});

describe('buildInputValuesForStep', () => {
  it('returns undefined when no inputs are declared', () => {
    expect(buildInputValuesForStep([], { stale: { mode: 'constant', value: '' } })).toBeUndefined();
  });

  it('returns undefined when all wiring keys are stale (e.g. after Test Case swap)', () => {
    expect(
      buildInputValuesForStep(
        [{ name: 'leadName', eventIndex: 0 }],
        { oldKey: { mode: 'constant', value: 'x' } },
      ),
    ).toBeUndefined();
  });

  it('keeps entries whose key is a currently-declared input', () => {
    const out = buildInputValuesForStep(
      [{ name: 'leadName', eventIndex: 0 }, { name: 'email', eventIndex: 1 }],
      {
        leadName: { mode: 'constant', value: 'Acme' },
        email: { mode: 'output', step: 1, outputName: 'email' },
        stale: { mode: 'constant', value: 'drop' },
      },
    );
    expect(out).toEqual({
      leadName: { mode: 'constant', value: 'Acme' },
      email: { mode: 'output', step: 1, outputName: 'email' },
    });
  });
});

describe('autoWireInputs', () => {
  it('wires an input to its single matching-name output source', () => {
    const out = autoWireInputs(
      [{ name: 'leadName', eventIndex: 0 }],
      [{ step: 1, testCaseSlug: 'create-lead', outputName: 'leadName' }],
    );
    expect(out).toEqual({
      leadName: { mode: 'output', step: 1, outputName: 'leadName' },
    });
  });

  it('returns no wiring when no source matches', () => {
    const out = autoWireInputs(
      [{ name: 'leadName', eventIndex: 0 }],
      [{ step: 1, testCaseSlug: 'create-lead', outputName: 'otherField' }],
    );
    expect(out).toEqual({});
  });

  it('skips wiring when two sources match the same name (ambiguity)', () => {
    const out = autoWireInputs(
      [{ name: 'leadName', eventIndex: 0 }],
      [
        { step: 1, testCaseSlug: 'create-lead', outputName: 'leadName' },
        { step: 2, testCaseSlug: 'create-lead-2', outputName: 'leadName' },
      ],
    );
    expect(out).toEqual({});
  });

  it('respects existing wiring (does not overwrite a user-set value)', () => {
    const out = autoWireInputs(
      [{ name: 'leadName', eventIndex: 0 }],
      [{ step: 1, testCaseSlug: 'create-lead', outputName: 'leadName' }],
      { leadName: { mode: 'constant', value: 'override' } },
    );
    expect(out).toEqual({
      leadName: { mode: 'constant', value: 'override' },
    });
  });

  it('wires multiple inputs in a single call', () => {
    const out = autoWireInputs(
      [
        { name: 'leadName', eventIndex: 0 },
        { name: 'leadId', eventIndex: 1 },
      ],
      [
        { step: 1, testCaseSlug: 'create-lead', outputName: 'leadName' },
        { step: 1, testCaseSlug: 'create-lead', outputName: 'leadId' },
      ],
    );
    expect(out).toEqual({
      leadName: { mode: 'output', step: 1, outputName: 'leadName' },
      leadId: { mode: 'output', step: 1, outputName: 'leadId' },
    });
  });

  it('returns {} when no declared inputs', () => {
    expect(
      autoWireInputs(
        [],
        [{ step: 1, testCaseSlug: 'x', outputName: 'y' }],
      ),
    ).toEqual({});
  });
});
