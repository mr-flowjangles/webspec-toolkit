/**
 * Golden tests for renderQueueSpec — Queue manifest + recording map →
 * `.spec.ts` source string. Pins the v1.4 queue renderer output shape
 * (test.describe.serial, per-step test(), iteration loops, header-switching).
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
// Fixture helpers — shaped to look like the recorder's output without the
// noise of a full DOM trace. Mirrors what `tests/render/e2e/renderer.test.ts`
// uses so behavior stays consistent across renderers.
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
  // v1.4.0 contract: iterations is optional. The renderer only emits a for-loop
  // when iterations > 1, so we omit the field for the default-1 case so the
  // fixture matches the on-disk manifest shape (manifests drop the field when
  // the user accepts the default).
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

describe('renderQueueSpec — single step', () => {
  const out = renderQueueSpec({
    queue: queue([step('create-lead', 'ANALYST01')]),
    recordings: recordingMap([['create-lead', CREATE_LEAD]]),
    authProfiles: [],
  });

  it('emits one test() block named with step number, testCase, and runAs', () => {
    expect(out).toContain(
      `test("Step 1 — create-lead (as ANALYST01)", async ({ page }) => {`,
    );
  });

  it('inlines the recording goto + actions', () => {
    expect(out).toContain(
      `await page.goto('http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks');`,
    );
    expect(out).toContain(
      `await page.getByRole('button', { name: 'Add Lead' }).click();`,
    );
  });

  it('inlines the recording description as a comment in the step body', () => {
    expect(out).toContain(`// Recording for create-lead.`);
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

      test.describe.serial('Test Queue', () => {
        test("Step 1 — create-lead (as ANALYST01)", async ({ page, context }) => {
          await context.setExtraHTTPHeaders({
            'uid': 'ANALYST01',
          });
          // Recording for create-lead.
          await page.goto('http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks');
          await page.getByRole('button', { name: 'Add Lead' }).click();
        });

        test("Step 2 — fill-details (as ANALYST01)", async ({ page }) => {
          // Recording for fill-details.
          await page.goto('http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks');
          await page.getByRole('textbox', { name: 'First Name' }).fill('Jane');
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

  it('adds the context fixture only on steps that emit setExtraHTTPHeaders', () => {
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
    expect(out).toContain(
      `test("Step 1 — create-lead (as ANALYST01)", async ({ page, context }) => {`,
    );
    expect(out).toContain(
      `test("Step 2 — fill-details (as ANALYST01)", async ({ page }) => {`,
    );
  });
});

describe('renderQueueSpec — iterations', () => {
  it('wraps the step body in a for loop when iterations > 1', () => {
    const out = renderQueueSpec({
      queue: queue([step('create-lead', 'ANALYST01', 3)]),
      recordings: recordingMap([['create-lead', CREATE_LEAD]]),
      authProfiles: [],
    });
    expect(out).toContain(`for (let i = 0; i < 3; i++) {`);
    expect(out).toContain(`"Step 1 — create-lead (as ANALYST01) × 3"`);
    // Goto + action live inside the loop.
    const idxFor = out.indexOf('for (let i = 0;');
    const idxGoto = out.indexOf('await page.goto');
    const idxAction = out.indexOf(`getByRole('button', { name: 'Add Lead' })`);
    const idxLoopClose = out.indexOf('    }', idxFor);
    expect(idxGoto).toBeGreaterThan(idxFor);
    expect(idxAction).toBeGreaterThan(idxGoto);
    expect(idxLoopClose).toBeGreaterThan(idxAction);
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
    expect(out).not.toContain(`const `);
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
