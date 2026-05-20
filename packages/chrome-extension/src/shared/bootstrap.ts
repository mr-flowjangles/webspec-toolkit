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

- \`test-cases/<slug>/\` — one folder per recorded **Test Case**, containing \`recording.json\` and a standalone \`recording.spec.ts\`.
- \`tests/queue-N-<slug>.spec.ts\` — composed **Queues** (one \`.spec.ts\` per Queue), each with its matching \`queue-N-<slug>.json\` manifest alongside it.

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

  return { wrote: true };
}
