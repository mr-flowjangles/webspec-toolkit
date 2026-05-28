/**
 * v1.6 integration tests — render → write → run for parametric inputs and
 * declared outputs.
 *
 * Where the v1.5 integration test confirmed the helper-module path renders
 * and runs for no-I/O recordings, this suite verifies the v1.6 wiring
 * actually flows end-to-end:
 *
 *   1. Parametric helper with defaults — standalone spec uses the recorded
 *      literal values via the `inputs` parameter's defaults; spec runs green.
 *   2. Parametric helper with overrides — a custom caller passes explicit
 *      `inputs` and reads the returned `outputs`; helper substitutes the
 *      provided values and extracts the declared outputs from page state.
 *   3. Queue with wired output reference — step 1 creates a lead, step 2
 *      consumes step 1's `leadId` output as its input; queue spec runs green
 *      with the captured-return-value flow.
 *
 * Each test gets a fresh sub-directory under `.tmp-v1-6/` so a failure
 * leaves a debuggable artifact behind. Same 60s timeout as the v1.5 suite.
 *
 * Requires Chromium installed once via `npx playwright install chromium`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  renderQueueSpec,
  renderTestCaseModule,
  renderTestCaseSpec,
} from '@webspec/core';
import type { Queue, WorkflowRecording } from '@webspec/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/playwright-target/lead-form.html');
const TMP_DIR = join(__dirname, '.tmp-v1-6');

const LEAD_FORM_URL = `file://${FIXTURE_PATH}`;

/**
 * Recording of "Create Lead": type a name, click Create.
 * Declared input promotes the typed name to a `leadName` parameter.
 * Declared outputs extract `leadId` (URL regex against the hash) and
 * `leadName` (text from #lead-title).
 */
function createLeadRecording(): WorkflowRecording {
  return {
    name: 'create-lead',
    description: 'v1.6 integration — types a lead name and creates a lead.',
    runAs: null,
    auth: null,
    startedAt: '2026-05-28T00:00:00.000Z',
    endedAt: '2026-05-28T00:00:05.000Z',
    startUrl: LEAD_FORM_URL,
    events: [
      {
        t: 100,
        kind: 'input',
        selector: { preferred: 'role=textbox[name="Lead Name"]', strategy: 'role', fallbacks: [] },
        value: 'Acme Corp',
        sensitive: false,
      },
      {
        t: 200,
        kind: 'click',
        selector: { preferred: 'role=button[name="Create"]', strategy: 'role', fallbacks: [] },
      },
    ],
    network: [],
    framework: 'playwright',
    inputs: [{ name: 'leadName', eventIndex: 0 }],
    outputs: [
      { name: 'leadId', source: { kind: 'url', pattern: '#/lead/(\\d+)' } },
      { name: 'leadName', source: { kind: 'text', selector: '#lead-title' } },
    ],
  };
}

/**
 * Recording of "View Lead": types a lead name (placeholder) and clicks Create.
 * The Queue test wires the typed value from step 1's `leadName` output, so the
 * step-2 helper will plant whatever step 1 returned into the same field.
 * The point isn't fidelity to a real "view lead" UI — it's to exercise the
 * captured-return-value flow end-to-end on the existing fixture.
 */
function viewLeadRecording(): WorkflowRecording {
  return {
    name: 'view-lead',
    description: 'v1.6 integration — second step that consumes step 1\'s leadName output.',
    runAs: null,
    auth: null,
    startedAt: '2026-05-28T00:00:10.000Z',
    endedAt: '2026-05-28T00:00:15.000Z',
    startUrl: LEAD_FORM_URL,
    events: [
      {
        t: 100,
        kind: 'input',
        selector: { preferred: 'role=textbox[name="Lead Name"]', strategy: 'role', fallbacks: [] },
        value: 'placeholder',
        sensitive: false,
      },
      {
        t: 200,
        kind: 'click',
        selector: { preferred: 'role=button[name="Create"]', strategy: 'role', fallbacks: [] },
      },
    ],
    network: [],
    framework: 'playwright',
    inputs: [{ name: 'incomingName', eventIndex: 0 }],
    outputs: [],
  };
}

const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['test-cases/**/*.spec.ts', 'tests/*.spec.ts'],
  fullyParallel: false,
  reporter: 'line',
  use: { headless: true },
});
`;

function writeTestCase(
  root: string,
  slug: string,
  recording: WorkflowRecording,
  withWrapperSpec: boolean,
): void {
  const dir = join(root, 'test-cases', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'recording.ts'), renderTestCaseModule(recording), 'utf8');
  if (withWrapperSpec) {
    writeFileSync(join(dir, 'recording.spec.ts'), renderTestCaseSpec(recording), 'utf8');
  }
}

function runPlaywright(cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync('npx', ['playwright', 'test', '--config', 'playwright.config.ts'], {
    cwd,
    encoding: 'utf8',
  });
}

function failWithRunnerOutput(result: ReturnType<typeof spawnSync>, label: string): never {
  throw new Error(
    `${label}: Playwright runner exited ${result.status}.\n\n--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}`,
  );
}

describe('v1.6 integration — parametric helper module', () => {
  it('standalone spec uses recorded-literal defaults and runs to green', () => {
    const root = join(TMP_DIR, 'parametric-defaults');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    writeFileSync(join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG, 'utf8');
    // wrapper spec calls `await run({ page, context })` — no inputs passed,
    // so the helper falls back to the recorded literal "Acme Corp".
    writeTestCase(root, 'create-lead', createLeadRecording(), true);

    const result = runPlaywright(root);
    if (result.status !== 0) failWithRunnerOutput(result, 'parametric defaults');
    expect(result.status).toBe(0);
  }, 60_000);

  it('a custom caller supplying explicit inputs receives the declared outputs back', () => {
    const root = join(TMP_DIR, 'parametric-overrides');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    writeFileSync(join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG, 'utf8');
    writeTestCase(root, 'create-lead', createLeadRecording(), false);

    // Custom spec — imports the helper, calls it with an explicit `leadName`,
    // and asserts both the substitution reached the field AND the declared
    // outputs were extracted (leadId matches the regex, leadName echoes back
    // the supplied value).
    const testsDir = join(root, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(
      join(testsDir, 'custom-call.spec.ts'),
      [
        "import { expect, test } from '@playwright/test';",
        "import { run } from '../test-cases/create-lead/recording.js';",
        '',
        "test('custom inputs flow through', async ({ page, context }) => {",
        "  const out = await run({ page, context }, { leadName: 'Wired Name' });",
        "  expect(out.leadName).toBe('Wired Name');",
        "  expect(out.leadId).toMatch(/^\\d+$/);",
        '});',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = runPlaywright(root);
    if (result.status !== 0) failWithRunnerOutput(result, 'parametric overrides');
    expect(result.status).toBe(0);
  }, 60_000);
});

describe('v1.6 integration — Queue with wired output reference', () => {
  it('step 2 reads step 1\'s output through the captured return value', () => {
    const root = join(TMP_DIR, 'queue-wired');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    writeFileSync(join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG, 'utf8');

    const createRec = createLeadRecording();
    const viewRec = viewLeadRecording();
    writeTestCase(root, 'create-lead', createRec, false);
    writeTestCase(root, 'view-lead', viewRec, false);

    const queue: Queue = {
      schemaVersion: 1,
      id: 'q1',
      name: 'Lead Flow',
      slug: 'lead-flow',
      steps: [
        {
          testCase: 'create-lead',
          runAs: '',
          inputValues: { leadName: { mode: 'constant', value: 'Acme Holdings' } },
        },
        {
          testCase: 'view-lead',
          runAs: '',
          inputValues: {
            incomingName: { mode: 'output', step: 1, outputName: 'leadName' },
          },
        },
      ],
      inputs: [],
    };

    const queueSpec = renderQueueSpec({
      queue,
      recordings: new Map([
        ['create-lead', createRec],
        ['view-lead', viewRec],
      ]),
      authProfiles: [],
    });

    // Sanity-check the rendered source — capture + wiring should both appear.
    // Captures are hoisted to the describe.serial body (v1.6.5 fix) so a
    // later test() block can read them; the assignment happens inside step 1.
    expect(queueSpec).toContain('let createLead_1!: Awaited<ReturnType<typeof createLead>>;');
    expect(queueSpec).toContain('createLead_1 = await createLead(');
    expect(queueSpec).toContain('createLead_1.leadName');

    const testsDir = join(root, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'queue-1-lead-flow.spec.ts'), queueSpec, 'utf8');

    const result = runPlaywright(root);
    if (result.status !== 0) failWithRunnerOutput(result, 'queue with wired output');
    expect(result.status).toBe(0);
  }, 60_000);
});
