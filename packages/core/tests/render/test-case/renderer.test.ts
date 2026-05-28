/**
 * Tests for the v1.5.0 Test Case renderer — helper-module (`recording.ts`)
 * and thin-wrapper-spec (`recording.spec.ts`) emitters.
 */
import { describe, expect, it } from 'vitest';
import {
  renderTestCaseModule,
  renderTestCaseSpec,
} from '../../../src/render/test-case/renderer.js';
import type {
  HardenedSelector,
  RecordedEvent,
  WorkflowRecording,
} from '../../../src/types/analysis.js';

function roleSelector(role: string, name: string): HardenedSelector {
  return { preferred: `role=${role}[name="${name}"]`, strategy: 'role', fallbacks: [] };
}

function recording(opts: Partial<WorkflowRecording> = {}): WorkflowRecording {
  return {
    name: 'Create Lead',
    description: 'Creates a lead in UCM Dev.',
    runAs: null,
    auth: null,
    startedAt: '2026-05-20T00:00:00.000Z',
    endedAt: '2026-05-20T00:00:05.000Z',
    startUrl: 'http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks',
    events: [{ t: 100, kind: 'click', selector: roleSelector('button', 'Add Lead') }],
    network: [],
    framework: 'playwright',
    ...opts,
  };
}

const BASE_EVENTS: RecordedEvent[] = [
  { t: 100, kind: 'click', selector: roleSelector('button', 'Add Lead') },
  {
    t: 200,
    kind: 'input',
    selector: roleSelector('textbox', 'First Name'),
    value: 'Jane',
    sensitive: false,
  },
];

describe('renderTestCaseModule', () => {
  const out = renderTestCaseModule(recording({ events: BASE_EVENTS }));

  it('imports BrowserContext + Page as type-only from @playwright/test', () => {
    expect(out).toContain("import type { BrowserContext, Page } from '@playwright/test';");
  });

  it('exports a named async function `run` with the canonical signature', () => {
    expect(out).toContain(
      'export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void> {',
    );
  });

  it('emits page.goto with the recording startUrl', () => {
    expect(out).toContain(
      `await page.goto('http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks');`,
    );
  });

  it('inlines recorded events via the shared renderEvent helper', () => {
    expect(out).toContain(`await page.getByRole('button', { name: 'Add Lead' }).click();`);
    expect(out).toContain(`await page.getByRole('textbox', { name: 'First Name' }).fill('Jane');`);
  });

  it('does NOT emit setExtraHTTPHeaders — headers are the caller\'s concern', () => {
    const withAuth = renderTestCaseModule(
      recording({
        auth: { profileName: 'UCM Dev', headers: { uid: 'ANALYST01' } },
      }),
    );
    expect(withAuth).not.toContain('setExtraHTTPHeaders');
  });

  it('renders the description into a JSDoc block above run()', () => {
    expect(out).toContain('/**');
    expect(out).toContain('* Creates a lead in UCM Dev.');
  });

  it('void context; line keeps the unused-context destructure ergonomic for callers', () => {
    expect(out).toContain('void context;');
  });

  it('matches a stable inline snapshot', () => {
    expect(out).toMatchInlineSnapshot(`
      "import type { BrowserContext, Page } from '@playwright/test';

      /**
       * Creates a lead in UCM Dev.
       *
       * Recorded 2026-05-20T00:00:00.000Z; runAs: (none).
       * Auth header injection is the caller's concern — Queue specs apply per-step
       * headers from the matching AuthProfile, and the sibling recording.spec.ts
       * applies the headers baked into recording.json.
       */
      export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void> {
        // context is unused in the helper body itself but kept on the signature so
        // callers don't have to special-case the destructure when threading auth.
        void context;

        await page.goto('http://app.ucm-dev.cmscloud.local/ucmnexgen/trackers/my-work/tasks');
        await page.getByRole('button', { name: 'Add Lead' }).click();
        await page.getByRole('textbox', { name: 'First Name' }).fill('Jane');
      }
      "
    `);
  });
});

describe('renderTestCaseSpec', () => {
  it('imports `run` from ./recording.js (NodeNext resolves to .ts source)', () => {
    const out = renderTestCaseSpec(recording());
    expect(out).toContain("import { run } from './recording.js';");
  });

  it('wraps the run() call in a test() titled with recording.name', () => {
    const out = renderTestCaseSpec(recording({ name: 'Create Lead' }));
    expect(out).toContain(`test('Create Lead', async ({ page, context }) => {`);
    expect(out).toContain('await run({ page, context });');
  });

  it('emits setExtraHTTPHeaders when recording.auth has headers', () => {
    const out = renderTestCaseSpec(
      recording({
        auth: { profileName: 'UCM Dev', headers: { uid: 'ANALYST01' } },
      }),
    );
    expect(out).toContain('await context.setExtraHTTPHeaders({');
    expect(out).toContain(`'uid': 'ANALYST01',`);
    // headers go before the helper call
    const idxHeaders = out.indexOf('setExtraHTTPHeaders');
    const idxRun = out.indexOf('await run(');
    expect(idxHeaders).toBeLessThan(idxRun);
  });

  it('skips setExtraHTTPHeaders when recording.auth is null', () => {
    const out = renderTestCaseSpec(recording({ auth: null }));
    expect(out).not.toContain('setExtraHTTPHeaders');
  });

  it('skips setExtraHTTPHeaders when recording.auth.headers is empty', () => {
    const out = renderTestCaseSpec(
      recording({ auth: { profileName: 'UCM Dev', headers: {} } }),
    );
    expect(out).not.toContain('setExtraHTTPHeaders');
  });
});

// v1.6.4 — parametric inputs + declared outputs change the helper signature
// and add an extraction tail. Backward compat for the no-I/O case is already
// covered by the inline snapshot above; these tests pin the new behavior.
describe('renderTestCaseModule — v1.6.4 inputs/outputs', () => {
  it('emits a typed inputs param with recorded-literal defaults when inputs are declared', () => {
    const out = renderTestCaseModule(
      recording({
        events: [
          {
            t: 100,
            kind: 'input',
            selector: roleSelector('textbox', 'Lead Name'),
            value: 'Acme Corp',
            sensitive: false,
          },
        ],
        inputs: [{ name: 'leadName', eventIndex: 0 }],
      }),
    );
    expect(out).toContain('inputs: { leadName: string } = { leadName: \'Acme Corp\' },');
  });

  it('substitutes inputs.<name> for the recorded literal at the promoted event', () => {
    const out = renderTestCaseModule(
      recording({
        events: [
          {
            t: 100,
            kind: 'input',
            selector: roleSelector('textbox', 'Lead Name'),
            value: 'Acme Corp',
            sensitive: false,
          },
        ],
        inputs: [{ name: 'leadName', eventIndex: 0 }],
      }),
    );
    expect(out).toContain(
      `await page.getByRole('textbox', { name: 'Lead Name' }).fill(inputs.leadName);`,
    );
    expect(out).not.toContain("fill('Acme Corp')");
  });

  it('non-promoted recorded events still emit their literal values', () => {
    const out = renderTestCaseModule(
      recording({
        events: [
          {
            t: 100,
            kind: 'input',
            selector: roleSelector('textbox', 'Lead Name'),
            value: 'Acme',
            sensitive: false,
          },
          {
            t: 200,
            kind: 'input',
            selector: roleSelector('textbox', 'Notes'),
            value: 'high priority',
            sensitive: false,
          },
        ],
        inputs: [{ name: 'leadName', eventIndex: 0 }],
      }),
    );
    expect(out).toContain('fill(inputs.leadName);');
    expect(out).toContain(`fill('high priority');`);
  });

  it('emits a typed return + url-source extraction when an outputs[].kind = url is declared', () => {
    const out = renderTestCaseModule(
      recording({
        outputs: [{ name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } }],
      }),
    );
    expect(out).toContain('): Promise<{ leadId: string }> {');
    expect(out).toContain(`const _out_leadId = page.url().match(/\\/leads\\/(\\d+)/)?.[1] ?? '';`);
    expect(out).toContain('return { leadId: _out_leadId };');
  });

  it('emits a text-source extraction with .textContent() and trim', () => {
    const out = renderTestCaseModule(
      recording({
        outputs: [{ name: 'leadName', source: { kind: 'text', selector: 'h1.lead-title' } }],
      }),
    );
    expect(out).toContain(
      `const _out_leadName = ((await page.locator('h1.lead-title').first().textContent()) ?? '').trim();`,
    );
    expect(out).toContain('return { leadName: _out_leadName };');
  });

  it('emits both inputs param and outputs return when both are declared', () => {
    const out = renderTestCaseModule(
      recording({
        events: [
          {
            t: 100,
            kind: 'input',
            selector: roleSelector('textbox', 'Lead Name'),
            value: 'Acme',
            sensitive: false,
          },
        ],
        inputs: [{ name: 'leadName', eventIndex: 0 }],
        outputs: [{ name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } }],
      }),
    );
    expect(out).toContain('inputs: { leadName: string } = { leadName: \'Acme\' },');
    expect(out).toContain('): Promise<{ leadId: string }> {');
  });

  it('keeps the no-I/O backward-compatible shape (signature unchanged, no return)', () => {
    const out = renderTestCaseModule(recording({ inputs: [], outputs: [] }));
    expect(out).toContain(
      'export async function run({ page, context }: { page: Page; context: BrowserContext }): Promise<void> {',
    );
    expect(out).not.toContain('inputs:');
    expect(out).not.toContain('return {');
  });
});
