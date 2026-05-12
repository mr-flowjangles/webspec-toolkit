/**
 * M6 integration test — closes the full pipeline loop:
 *
 *   hand-written WorkflowRecording fixture
 *     → renderPlaywrightSpec
 *     → spawn `npx playwright test` against the rendered spec
 *     → assert exit code 0
 *
 * The fixture HTML lives under `tests/fixtures/playwright-target/` and is
 * loaded by the rendered spec via `file://`. The spec is written to a
 * gitignored `.tmp/` directory under this folder so node_modules resolution
 * still works for `@playwright/test`.
 *
 * Requires Chromium installed once via `npx playwright install chromium`.
 * If Chromium isn't installed, Playwright's runner reports the missing
 * binary and this test fails with a clear message.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { renderPlaywrightSpec } from '@webspec/core';
import type { WorkflowRecording } from '@webspec/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/playwright-target/form.html');
const TMP_DIR = join(__dirname, '.tmp');

function buildRecording(): WorkflowRecording {
  const fileUrl = `file://${FIXTURE_PATH}`;
  return {
    startedAt: '2026-05-12T00:00:00.000Z',
    endedAt: '2026-05-12T00:00:10.000Z',
    startUrl: fileUrl,
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
      {
        t: 400,
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
  fullyParallel: false,
  reporter: 'line',
  use: { headless: true },
});
`;

describe('M6 integration — render and run', () => {
  it('renders the form fixture into a spec that compiles and runs to green', () => {
    // Fresh temp dir per run — no stale artifacts from a previous failure.
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });

    const recording = buildRecording();
    const spec = renderPlaywrightSpec(recording);

    const specPath = join(TMP_DIR, 'rendered.spec.ts');
    const configPath = join(TMP_DIR, 'playwright.config.ts');
    writeFileSync(specPath, spec, 'utf8');
    writeFileSync(configPath, PLAYWRIGHT_CONFIG, 'utf8');

    const result = spawnSync(
      'npx',
      ['playwright', 'test', '--config', configPath, specPath],
      { cwd: TMP_DIR, encoding: 'utf8' },
    );

    if (result.status !== 0) {
      // Surface the Playwright runner's own output so a failure here is
      // actually debuggable — we'd otherwise just see an exit-code mismatch.
      throw new Error(
        `Playwright runner exited ${result.status}.\n\n--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}`,
      );
    }

    expect(result.status).toBe(0);
  }, 60_000);
});
