/**
 * Bootstrap helper for v1.4 Queues + Team Shareability.
 *
 * When a user points webspec at an empty repo for the first time, we scaffold
 * the minimum set of files needed for a teammate (or CI) to clone, install,
 * and run the tests with no further setup:
 *
 *   - `package.json`          — pinned `@playwright/test`, `test` / `test:ui` scripts
 *   - `playwright.config.ts`  — single project that picks up both
 *                               `test-cases/**\/*.spec.ts` (per-Test-Case specs
 *                               written by v1.3.4) and `tests/queue-*-*.spec.ts`
 *                               (per-Queue specs written by v1.4.1)
 *   - `.gitignore`            — Playwright + Node + macOS noise
 *   - `README.md`             — what this repo is and how to run it
 *
 * Detection signal: a repo is considered "empty / fresh init" when its root
 * lacks a `package.json`. That's the canonical marker — a repo that's already
 * been bootstrapped (or already had Playwright wired up by a teammate) will
 * have one, and we leave it alone. See `docs/10-team-shareability.md`
 * § "v1.4 MVP scope" item 4 and § "Implementation-detail questions" — the
 * call site is required to surface a confirmation prompt before we touch the
 * user's repo, which we model here as an injected `confirm` callback so this
 * module stays UI-agnostic (popup, options page, future test code can all
 * provide their own).
 *
 * This module does NOT decide *when* to call `ensureBootstrap` — callers
 * (Queue save, Test Case save) invoke it as the first step of their write
 * flow. It also does not modify `node_modules`; teammates run their own
 * `pnpm install` / `npm install` after cloning.
 */

import { writeFileToRepoFolder } from './repoFolder.js';

// ---------------------------------------------------------------------------
// Scaffold file contents
// ---------------------------------------------------------------------------
//
// Exported so they can be inspected in code review and asserted against in
// tests without depending on filesystem I/O. The placeholder repo name in
// `package.json` is `webspec-tests`; teammates can rename it after the first
// scaffold — webspec never overwrites these files once they exist.

export const BOOTSTRAP_PACKAGE_JSON = `${JSON.stringify(
  {
    name: 'webspec-tests',
    private: true,
    type: 'module',
    scripts: {
      test: 'playwright test',
      'test:ui': 'playwright test --ui',
    },
    devDependencies: {
      '@playwright/test': '^1.60.0',
    },
  },
  null,
  2,
)}\n`;

export const BOOTSTRAP_PLAYWRIGHT_CONFIG = `// Scaffolded by the webspec Chrome extension — see docs/10-team-shareability.md.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['test-cases/**/*.spec.ts', 'tests/queue-*-*.spec.ts'],
  use: {},
  reporter: 'list',
});
`;

export const BOOTSTRAP_GITIGNORE = `node_modules/
test-results/
playwright-report/
.DS_Store
*.log
`;

/**
 * GitHub Actions workflow — v1.5.1 CI surface (docs/10 § "v1.5.1 — CI Surface").
 *
 * Runs on push + PR to main, plus manual workflow_dispatch. Single ubuntu-latest
 * job, Chromium-only (Firefox + WebKit add ~10 min and aren't part of v1's
 * golden-path mission). Uploads the Playwright HTML report as a job artifact
 * regardless of pass/fail so a failed CI run is debuggable from the Actions tab.
 *
 * Secrets: NOT addressed in v1.5.1. Recorded auth headers ship committed in
 * recording.json + the rendered specs. CI runs them as-is — fine for public
 * sites and sandboxes, surfaces credentials for auth-required environments.
 * The README's CI section flags this; the secrets-aware rewriter is v1.6+.
 */
export const BOOTSTRAP_GITHUB_WORKFLOW = `name: Playwright tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch: {}

jobs:
  test:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Run Playwright tests
        run: npm test
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
`;

export const BOOTSTRAP_README = `# webspec test repo

This repo was scaffolded by the [webspec](https://github.com/mr-flowjangles/webspec-toolkit) Chrome extension. It holds the Playwright tests recorded for one app.

## Install

\`\`\`sh
npm install
# or
pnpm install
\`\`\`

## Run

\`\`\`sh
npm test            # headless run
npm run test:ui     # Playwright UI
\`\`\`

A single Playwright project picks up both directories — no per-folder config to maintain.

## Layout

- \`test-cases/<slug>/\` — one folder per recorded **Test Case**, containing \`recording.json\`, a reusable \`recording.ts\` helper (\`export async function run({ page, context })\`), and a standalone \`recording.spec.ts\` wrapper.
- \`tests/queue-N-<slug>.spec.ts\` — composed **Queues** (one \`.spec.ts\` per Queue) that \`import { run as … }\` from the Test Case helpers above. Each Queue ships with a matching \`queue-N-<slug>.json\` manifest alongside it — the manifest is the editable source of truth; the spec is regenerated by the extension on every Save.

## CI

This repo ships with \`.github/workflows/playwright.yml\` — Playwright runs in GitHub Actions on every push to \`main\` and every pull request, plus on-demand via the **Run workflow** button. The Playwright HTML report uploads as a job artifact regardless of pass/fail; download it from the Actions tab to debug a failed run.

**Secrets caveat.** Recorded auth headers (from a webspec Auth Profile) are committed in \`recording.json\` and in the rendered \`setExtraHTTPHeaders\` calls. CI runs them verbatim. If your headers contain real credentials, either:

1. Replace the committed values with \`\${{ secrets.NAME }}\` style references by hand in the workflow and/or the spec files, then add the secrets in GitHub → Settings → Secrets and variables → Actions, **or**
2. Keep CI scoped to a sandbox / synthetic-data environment where the committed headers are safe.

Either way, **never commit production credentials** — audit the recordings before pushing the repo to a public location. A "secrets-aware rewriter" that templates header values automatically is on the post-v1.5 roadmap.

See [\`docs/10-team-shareability.md\`](https://github.com/mr-flowjangles/webspec-toolkit/blob/main/docs/10-team-shareability.md) in the webspec repo for the design.
`;

// ---------------------------------------------------------------------------
// Detection + bootstrap
// ---------------------------------------------------------------------------

/**
 * True when the repo root has no `package.json` — our signal for "empty repo,
 * needs bootstrapping." Any other I/O error is treated as "we can't tell,
 * don't bootstrap" — safer to no-op than to risk overwriting a teammate's
 * existing setup we just failed to read.
 */
export async function needsBootstrap(rootHandle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await rootHandle.getFileHandle('package.json');
    return false;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return true;
    }
    // Unexpected error — fail safe, don't bootstrap.
    console.warn('[webspec] needsBootstrap: unexpected error probing package.json:', err);
    return false;
  }
}

export interface EnsureBootstrapOptions {
  /** Asked before any file is written. Return `true` to proceed, `false` to abort. */
  confirm: () => Promise<boolean>;
}

export type EnsureBootstrapResult =
  | { wrote: true }
  | { wrote: false; reason: 'not-needed' | 'declined' };

/**
 * If the repo lacks a `package.json`, ask the caller to confirm and then
 * write the four scaffold files. Otherwise no-op.
 *
 * Files written (relative to `rootHandle`):
 *   - `package.json`
 *   - `playwright.config.ts`
 *   - `.gitignore`
 *   - `README.md`
 *
 * Returns:
 *   - `{ wrote: true }` when the four files were written.
 *   - `{ wrote: false, reason: 'not-needed' }` when a `package.json` already
 *     exists (in which case `confirm` is never called).
 *   - `{ wrote: false, reason: 'declined' }` when the user said no.
 */
export async function ensureBootstrap(
  rootHandle: FileSystemDirectoryHandle,
  options: EnsureBootstrapOptions,
): Promise<EnsureBootstrapResult> {
  if (!(await needsBootstrap(rootHandle))) {
    return { wrote: false, reason: 'not-needed' };
  }

  const ok = await options.confirm();
  if (!ok) {
    return { wrote: false, reason: 'declined' };
  }

  await writeFileToRepoFolder(rootHandle, 'package.json', BOOTSTRAP_PACKAGE_JSON);
  await writeFileToRepoFolder(rootHandle, 'playwright.config.ts', BOOTSTRAP_PLAYWRIGHT_CONFIG);
  await writeFileToRepoFolder(rootHandle, '.gitignore', BOOTSTRAP_GITIGNORE);
  await writeFileToRepoFolder(rootHandle, 'README.md', BOOTSTRAP_README);
  await writeFileToRepoFolder(
    rootHandle,
    '.github/workflows/playwright.yml',
    BOOTSTRAP_GITHUB_WORKFLOW,
  );

  return { wrote: true };
}
