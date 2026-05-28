/**
 * Golden tests for renderQueueSpec — Queue manifest + recording map →
 * `.spec.ts` source string. Pins the v1.5.0 import-based queue renderer
 * (imports `run` from each Test Case helper module, calls it inside
 * test() blocks instead of inlining recorded events).
 */
import { describe, expect, it } from 'vitest';
import { renderQueueSpec } from '../../../src/render/queue/renderer.js';
import type {
  HardenedSelector,
  RecordedEvent,
  WorkflowRecording,
} from '../../../src/types/analysis.js';
import type { AuthProfile } from '../../../src/library/auth-profile.js';
import type { Queue, QueueStep } from '../../../src/library/queue.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function roleSelector(role: string, name: string): HardenedSelector {
  return {
    preferred: `role=${role}[name="${name}"]`,
    strategy: 'role',
    fallbacks: [],
  };
}

function recording(
  name: string,
  events: RecordedEvent[],
  startUrl = 'http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks',
): WorkflowRecording {
  return {
    name,
    description: `Recording for ${name}.`,
    runAs: null,
    auth: null,
    startedAt: '2026-05-20T00:00:00.000Z',
    endedAt: '2026-05-20T00:00:05.000Z',
    startUrl,
    events,
    network: [],
    framework: 'playwright',
  };
}

const CREATE_LEAD: WorkflowRecording = recording('create-lead', [
  { t: 100, kind: 'click', selector: roleSelector('button', 'Add Lead') },
]);

const FILL_DETAILS: WorkflowRecording = recording('fill-details', [
  {
    t: 200,
    kind: 'input',
    selector: roleSelector('textbox', 'First Name'),
    value: 'Jane',
    sensitive: false,
  },
]);

const APPROVE_LEAD: WorkflowRecording = recording('approve-lead', [
  { t: 300, kind: 'click', selector: roleSelector('button', 'Approve') },
]);

const UCM_DEV_PROFILE: AuthProfile = {
  id: 'ucm-dev',
  name: 'UCM Dev',
  urlPattern: 'http://app.ucm-dev.cmscloud.local/*',
  headers: [{ name: 'uid', value: '${runAs}' }],
};

function step(testCase: string, runAs: string, iterations = 1): QueueStep {
  return iterations > 1 ? { testCase, runAs, iterations } : { testCase, runAs };
}

function queue(steps: QueueStep[], extra: Partial<Queue> = {}): Queue {
  return {
    schemaVersion: 1,
    id: 'q1',
    name: 'Test Queue',
    slug: 'test-queue',
    inputs: [],
    steps,
    ...extra,
  };
}

function recordingMap(
  entries: Array<[string, WorkflowRecording]>,
): Map<string, WorkflowRecording> {
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderQueueSpec — scaffold', () => {
  const out = renderQueueSpec({
    queue: queue([step('create-lead', 'ANALYST01')]),
    recordings: recordingMap([['create-lead', CREATE_LEAD]]),
    authProfiles: [],
  });

  it('emits a file-header comment naming the queue', () => {
    expect(out).toContain('// Queue: Test Queue');
  });

  it('imports test + expect from @playwright/test', () => {
    expect(out).toContain(`import { expect, test } from '@playwright/test';`);
  });

  it('opens a test.describe.serial titled with the queue name', () => {
    expect(out).toContain(`test.describe.serial('Test Queue', () => {`);
  });

  it('closes the describe block', () => {
    expect(out.trimEnd().endsWith('});')).toBe(true);
  });
});

describe('renderQueueSpec — imports', () => {
  it('emits one import per unique Test Case slug with a camelCase alias', () => {
    const out = renderQueueSpec({
      queue: queue([
        step('create-lead', 'ANALYST01'),
        step('fill-details', 'ANALYST01'),
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['fill-details', FILL_DETAILS],
      ]),
      authProfiles: [],
    });
    expect(out).toContain(
      `import { run as createLead } from '../test-cases/create-lead/recording.js';`,
    );
    expect(out).toContain(
      `import { run as fillDetails } from '../test-cases/fill-details/recording.js';`,
    );
  });

  it('dedupes imports when a slug is used by multiple steps', () => {
    const out = renderQueueSpec({
      queue: queue([
        step('create-lead', 'ANALYST01'),
        step('create-lead', 'ANALYST01'),
      ]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    const importMatches =
      out.match(/import \{ run as createLead \}/g) ?? [];
    expect(importMatches.length).toBe(1);
  });

  it('sorts imports alphabetically by slug for stable diffs', () => {
    const out = renderQueueSpec({
      queue: queue([
        // Z first in step order, A second — imports should still be A then Z.
        step('z-step', 'X'),
        step('a-step', 'X'),
      ]),
      recordings: recordingMap([
        ['z-step', recording('z-step', [])],
        ['a-step', recording('a-step', [])],
      ]),
      authProfiles: [],
    });
    const idxA = out.indexOf("from '../test-cases/a-step/recording.js'");
    const idxZ = out.indexOf("from '../test-cases/z-step/recording.js'");
    expect(idxA).toBeGreaterThan(-1);
    expect(idxA).toBeLessThan(idxZ);
  });
});

describe('renderQueueSpec — single step', () => {
  const out = renderQueueSpec({
    queue: queue([step('create-lead', 'ANALYST01')]),
    recordings: recordingMap([['create-lead', CREATE_LEAD]]),
    authProfiles: [],
  });

  it('emits one test() block named with step number, testCase, and runAs', () => {
    expect(out).toContain(
      `test("Step 1 — create-lead (as ANALYST01)", async ({ page, context }) => {`,
    );
  });

  it('calls the imported helper instead of inlining events', () => {
    expect(out).toContain('await createLead({ page, context });');
    expect(out).not.toContain('page.goto');
    expect(out).not.toContain('getByRole');
  });

  it('omits setExtraHTTPHeaders when no auth profile matches', () => {
    expect(out).not.toContain('setExtraHTTPHeaders');
  });
});

describe('renderQueueSpec — two-step happy path', () => {
  const out = renderQueueSpec({
    queue: queue([
      step('create-lead', 'ANALYST01'),
      step('fill-details', 'ANALYST01'),
    ]),
    recordings: recordingMap([
      ['create-lead', CREATE_LEAD],
      ['fill-details', FILL_DETAILS],
    ]),
    authProfiles: [UCM_DEV_PROFILE],
  });

  it('emits both step titles in order', () => {
    const idxStep1 = out.indexOf(`"Step 1 — create-lead (as ANALYST01)"`);
    const idxStep2 = out.indexOf(`"Step 2 — fill-details (as ANALYST01)"`);
    expect(idxStep1).toBeGreaterThan(-1);
    expect(idxStep2).toBeGreaterThan(idxStep1);
  });

  it('matches the golden snapshot', () => {
    expect(out).toMatchInlineSnapshot(`
      "// Queue: Test Queue
      import { expect, test } from '@playwright/test';
      import { run as createLead } from '../test-cases/create-lead/recording.js';
      import { run as fillDetails } from '../test-cases/fill-details/recording.js';
      void expect;

      test.describe.serial('Test Queue', () => {
        test("Step 1 — create-lead (as ANALYST01)", async ({ page, context }) => {
          await context.setExtraHTTPHeaders({
            'uid': 'ANALYST01',
          });
          await createLead({ page, context });
        });

        test("Step 2 — fill-details (as ANALYST01)", async ({ page, context }) => {
          await fillDetails({ page, context });
        });
      });
      "
    `);
  });
});

describe('renderQueueSpec — header switching', () => {
  it('emits setExtraHTTPHeaders only on the first step when both runAs are the same', () => {
    const out = renderQueueSpec({
      queue: queue([
        step('create-lead', 'ANALYST01'),
        step('fill-details', 'ANALYST01'),
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['fill-details', FILL_DETAILS],
      ]),
      authProfiles: [UCM_DEV_PROFILE],
    });
    const matches = out.match(/setExtraHTTPHeaders/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('emits setExtraHTTPHeaders on every step boundary when runAs differs per step', () => {
    const out = renderQueueSpec({
      queue: queue([
        step('create-lead', 'ANALYST01'),
        step('approve-lead', 'SUPERVISOR99'),
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['approve-lead', APPROVE_LEAD],
      ]),
      authProfiles: [UCM_DEV_PROFILE],
    });
    const matches = out.match(/setExtraHTTPHeaders/g) ?? [];
    expect(matches.length).toBe(2);
    expect(out).toContain(`'uid': 'ANALYST01',`);
    expect(out).toContain(`'uid': 'SUPERVISOR99',`);
  });

  it('always destructures { page, context } since the helper needs both', () => {
    const out = renderQueueSpec({
      queue: queue([
        step('create-lead', 'ANALYST01'),
        step('fill-details', 'ANALYST01'),
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['fill-details', FILL_DETAILS],
      ]),
      authProfiles: [UCM_DEV_PROFILE],
    });
    const matches = out.match(/async \(\{ page, context \}\)/g) ?? [];
    expect(matches.length).toBe(2);
  });
});

describe('renderQueueSpec — iterations', () => {
  it('wraps the helper call in a for loop when iterations > 1', () => {
    const out = renderQueueSpec({
      queue: queue([step('create-lead', 'ANALYST01', 3)]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    expect(out).toContain(`for (let i = 0; i < 3; i++) {`);
    expect(out).toContain(`"Step 1 — create-lead (as ANALYST01) × 3"`);
    expect(out).toContain(`      await createLead({ page, context });`);
  });

  it('does not wrap when iterations is 1', () => {
    const out = renderQueueSpec({
      queue: queue([step('create-lead', 'ANALYST01', 1)]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    expect(out).not.toContain('for (let i');
    expect(out).not.toContain('× 1');
  });
});

describe('renderQueueSpec — inputs', () => {
  it('emits declared inputs as const lines at the top of the describe block', () => {
    const out = renderQueueSpec({
      queue: queue([step('create-lead', 'ANALYST01')], {
        inputs: [
          { name: 'record_id', value: 'CSE-12345' },
          { name: 'priority', value: 'high' },
        ],
      }),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    expect(out).toContain(`  const record_id = 'CSE-12345';`);
    expect(out).toContain(`  const priority = 'high';`);
    const idxDescribe = out.indexOf('test.describe.serial');
    const idxConst = out.indexOf('const record_id');
    const idxFirstTest = out.indexOf(`test("Step 1`);
    expect(idxConst).toBeGreaterThan(idxDescribe);
    expect(idxConst).toBeLessThan(idxFirstTest);
  });

  it('omits the inputs section when none are declared', () => {
    const out = renderQueueSpec({
      queue: queue([step('create-lead', 'ANALYST01')]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    // Only the inputs-only `const ...` lines would appear in the body;
    // confirm none made it through.
    expect(out).not.toMatch(/^\s+const \w+ =/m);
  });
});

describe('renderQueueSpec — error cases', () => {
  it('throws a clear error when a step references a missing testCase slug', () => {
    expect(() =>
      renderQueueSpec({
        queue: queue([
          step('create-lead', 'ANALYST01'),
          step('does-not-exist', 'ANALYST01'),
        ]),
        recordings: recordingMap([['create-lead', CREATE_LEAD]]),
        authProfiles: [],
      }),
    ).toThrow(/does-not-exist/);
  });

  it('names the failing step index in the error', () => {
    expect(() =>
      renderQueueSpec({
        queue: queue([step('missing', 'X')]),
        recordings: recordingMap([]),
        authProfiles: [],
      }),
    ).toThrow(/step 1/);
  });
});

// v1.6.4 — per-step inputValues drive the helper call's second argument and
// whether the return value is captured for downstream wiring.
describe('renderQueueSpec — v1.6.4 inputValues', () => {
  it('renders constant wiring as a quoted key/value pair', () => {
    const out = renderQueueSpec({
      queue: queue([
        {
          testCase: 'create-lead',
          runAs: 'X',
          inputValues: { leadName: { mode: 'constant', value: 'Acme Corp' } },
        },
      ]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    expect(out).toContain(`await createLead({ page, context }, { leadName: 'Acme Corp' });`);
  });

  it('captures the return value when a later step references this step\'s output', () => {
    const out = renderQueueSpec({
      queue: queue([
        { testCase: 'create-lead', runAs: 'X' },
        {
          testCase: 'fill-details',
          runAs: 'X',
          inputValues: {
            leadName: { mode: 'output', step: 1, outputName: 'leadName' },
          },
        },
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['fill-details', FILL_DETAILS],
      ]),
      authProfiles: [],
    });
    expect(out).toContain(`const createLead_1 = await createLead({ page, context });`);
    expect(out).toContain(
      `await fillDetails({ page, context }, { leadName: createLead_1.leadName });`,
    );
  });

  it('does not capture return value when no later step references it', () => {
    const out = renderQueueSpec({
      queue: queue([
        { testCase: 'create-lead', runAs: 'X' },
        { testCase: 'fill-details', runAs: 'X' },
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['fill-details', FILL_DETAILS],
      ]),
      authProfiles: [],
    });
    expect(out).toContain(`await createLead({ page, context });`);
    expect(out).not.toContain('const createLead_1');
    expect(out).not.toContain('const createLead_');
  });

  it('iterated step with inputValues passes the same inputs each iteration', () => {
    const out = renderQueueSpec({
      queue: queue([
        {
          testCase: 'fill-details',
          runAs: 'X',
          iterations: 3,
          inputValues: { leadName: { mode: 'constant', value: 'Acme' } },
        },
      ]),
      recordings: recordingMap([['fill-details', FILL_DETAILS]]),
      authProfiles: [],
    });
    expect(out).toContain(`for (let i = 0; i < 3; i++) {`);
    expect(out).toContain(
      `await fillDetails({ page, context }, { leadName: 'Acme' });`,
    );
  });

  it('does not capture an iterated step\'s return value even with empty inputValues', () => {
    const out = renderQueueSpec({
      queue: queue([
        { testCase: 'create-lead', runAs: 'X', iterations: 100 },
        { testCase: 'fill-details', runAs: 'X' },
      ]),
      recordings: recordingMap([
        ['create-lead', CREATE_LEAD],
        ['fill-details', FILL_DETAILS],
      ]),
      authProfiles: [],
    });
    expect(out).not.toContain('const createLead_1');
  });

  it('renders multiple inputValues entries in stable key order', () => {
    const out = renderQueueSpec({
      queue: queue([
        {
          testCase: 'create-lead',
          runAs: 'X',
          inputValues: {
            leadName: { mode: 'constant', value: 'Acme' },
            notes: { mode: 'constant', value: 'priority' },
          },
        },
      ]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    expect(out).toContain(
      `await createLead({ page, context }, { leadName: 'Acme', notes: 'priority' });`,
    );
  });
});
