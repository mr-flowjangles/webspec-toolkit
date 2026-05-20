/**
 * v1.5 integration tests — render → write → run for the new helper-module
 * + Queue paths.
 *
 * The existing `render-and-run.integration.test.ts` covers the old v0.7.0
 * inline renderer (`renderPlaywrightSpec`). These tests close the equivalent
 * loop for v1.5.0+:
 *
 *   1. Test Case helper module path:
 *      WorkflowRecording fixture
 *        → renderTestCaseModule (recording.ts)
 *        → renderTestCaseSpec   (thin wrapper that imports run())
 *        → `npx playwright test` against the wrapper
 *        → assert exit code 0
 *
 *   2. Queue path:
 *      Two WorkflowRecording fixtures + a Queue manifest
 *        → renderTestCaseModule for each (test-cases/<slug>/recording.ts)
 *        → renderQueueSpec (tests/queue-1-<slug>.spec.ts with imports)
 *        → `npx playwright test` against the Queue spec
 *        → assert exit code 0
 *
 * Both tests share the same `form.html` fixture used by M6 so we don't have
 * to author new HTML. The whole point: catch generated-TypeScript compile
 * errors at the renderer seam BEFORE the extension's manual save flow does.
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
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/playwright-target/form.html');
const TMP_DIR = join(__dirname, '.tmp-v1-5');

const FORM_URL = `file://${FIXTURE_PATH}`;

function fillFormRecording(): WorkflowRecording {
  return {
    name: 'fills the form',
    description: 'v1.5 integration — fills Email + Country + Subscribe on form.html.',
    runAs: null,
    auth: null,
    startedAt: '2026-05-20T00:00:00.000Z',
    endedAt: '2026-05-20T00:00:05.000Z',
    startUrl: FORM_URL,
    events: [
      {
        t: 100,
        kind: 'input',
        selector: { preferred: 'role=textbox[name="Email"]', strategy: 'role', fallbacks: [] },
        value: 'user@example.com',
        sensitive: false,
      },
      {
        t: 200,
        kind: 'change',
        selector: { preferred: 'role=combobox[name="Country"]', strategy: 'role', fallbacks: [] },
        value: 'ca',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'ca', label: 'Canada' },
          { value: 'mx', label: 'Mexico' },
        ],
      },
      {
        t: 300,
        kind: 'change',
        selector: {
          preferred: 'role=checkbox[name="Subscribe to the newsletter"]',
          strategy: 'role',
          fallbacks: [],
        },
        value: 'true',
      },
    ],
    network: [],
    framework: 'playwright',
  };
}

function submitFormRecording(): WorkflowRecording {
  return {
    name: 'submits the form',
    description: 'v1.5 integration — clicks Submit on form.html.',
    runAs: null,
    auth: null,
    startedAt: '2026-05-20T00:00:00.000Z',
    endedAt: '2026-05-20T00:00:01.000Z',
    startUrl: FORM_URL,
    events: [
      {
        t: 100,
        kind: 'click',
        selector: { preferred: 'role=button[name="Submit"]', strategy: 'role', fallbacks: [] },
      },
    ],
    network: [],
    framework: 'playwright',
  };
}

const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['test-cases/**/*.spec.ts', 'tests/queue-*-*.spec.ts'],
  fullyParallel: false,
  reporter: 'line',
  use: { headless: true },
});
`;

/**
 * Lay out the v1.5 on-disk shape into `root`:
 *   <root>/
 *     playwright.config.ts
 *     test-cases/<slug>/
 *       recording.ts        ← renderTestCaseModule
 *       recording.spec.ts   ← renderTestCaseSpec (only if `withWrapperSpec`)
 */
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

function runPlaywright(cwd: string, extra: string[] = []): ReturnType<typeof spawnSync> {
  return spawnSync('npx', ['playwright', 'test', '--config', 'playwright.config.ts', ...extra], {
    cwd,
    encoding: 'utf8',
  });
}

function failWithRunnerOutput(result: ReturnType<typeof spawnSync>, label: string): never {
  throw new Error(
    `${label}: Playwright runner exited ${result.status}.\n\n--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}`,
  );
}

describe('v1.5 integration — Test Case helper module', () => {
  it('renderTestCaseModule + renderTestCaseSpec produce a spec that runs to green', () => {
    const root = join(TMP_DIR, 'helper-module');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    writeFileSync(join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG, 'utf8');
    writeTestCase(root, 'fills-the-form', fillFormRecording(), true);

    const result = runPlaywright(root);
    if (result.status !== 0) failWithRunnerOutput(result, 'helper-module path');
    expect(result.status).toBe(0);
  }, 60_000);
});

describe('v1.5 integration — Queue renderer', () => {
  it('renderQueueSpec produces a queue spec that imports helpers and runs to green', () => {
    const root = join(TMP_DIR, 'queue');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    writeFileSync(join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG, 'utf8');

    // Two Test Cases: fills the form, submits the form. Compose into a Queue.
    const fillRec = fillFormRecording();
    const submitRec = submitFormRecording();
    writeTestCase(root, 'fills-the-form', fillRec, false);
    writeTestCase(root, 'submits-the-form', submitRec, false);

    const queue: Queue = {
      schemaVersion: 1,
      id: 'q1',
      name: 'Form Smoke',
      slug: 'form-smoke',
      steps: [
        { testCase: 'fills-the-form', runAs: '' },
        { testCase: 'submits-the-form', runAs: '' },
      ],
      inputs: [],
    };

    const queueSpec = renderQueueSpec({
      queue,
      recordings: new Map([
        ['fills-the-form', fillRec],
        ['submits-the-form', submitRec],
      ]),
      authProfiles: [],
    });

    const testsDir = join(root, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'queue-1-form-smoke.spec.ts'), queueSpec, 'utf8');

    const result = runPlaywright(root);
    if (result.status !== 0) failWithRunnerOutput(result, 'queue path');
    expect(result.status).toBe(0);
  }, 60_000);

  it('iterations wrap the helper call and execute N times against the page', () => {
    const root = join(TMP_DIR, 'queue-iterations');
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    writeFileSync(join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG, 'utf8');

    const submitRec = submitFormRecording();
    writeTestCase(root, 'submits-the-form', submitRec, false);

    const queue: Queue = {
      schemaVersion: 1,
      id: 'q1',
      name: 'Iterated Submit',
      slug: 'iterated-submit',
      steps: [{ testCase: 'submits-the-form', runAs: '', iterations: 3 }],
      inputs: [],
    };

    const queueSpec = renderQueueSpec({
      queue,
      recordings: new Map([['submits-the-form', submitRec]]),
      authProfiles: [],
    });

    // Sanity-check the rendered source — the loop should be present.
    expect(queueSpec).toContain('for (let i = 0; i < 3; i++)');

    const testsDir = join(root, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'queue-1-iterated-submit.spec.ts'), queueSpec, 'utf8');

    const result = runPlaywright(root);
    if (result.status !== 0) failWithRunnerOutput(result, 'queue iterations path');
    expect(result.status).toBe(0);
  }, 60_000);
});
