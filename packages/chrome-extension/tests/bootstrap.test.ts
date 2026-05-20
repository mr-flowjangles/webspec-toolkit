// @vitest-environment happy-dom

/**
 * Tests for the v1.4 repo bootstrap helper.
 *
 * The bootstrap logic itself is small — read one file handle, ask a yes/no
 * question, write four files — but it sits on the user's filesystem, so the
 * branches matter: never overwrite, never write without confirmation, write
 * all four together when we do write. These tests mock the
 * `FileSystemDirectoryHandle` surface (same pattern as `repoFolder.test.ts`)
 * and assert on the bookkeeping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOTSTRAP_GITHUB_WORKFLOW,
  BOOTSTRAP_GITIGNORE,
  BOOTSTRAP_PACKAGE_JSON,
  BOOTSTRAP_PLAYWRIGHT_CONFIG,
  BOOTSTRAP_README,
  ensureBootstrap,
  needsBootstrap,
} from '../src/shared/bootstrap.js';

// ---------------------------------------------------------------------------
// Fake directory-handle scaffolding (mirrors tests/repoFolder.test.ts).
// ---------------------------------------------------------------------------

interface FakeWritable {
  written: string[];
  closed: boolean;
}

interface FakeFileHandle {
  name: string;
  writable: FakeWritable;
  createWritable: ReturnType<typeof vi.fn>;
}

interface FakeDirectoryHandle {
  name: string;
  childDirs: Map<string, FakeDirectoryHandle>;
  childFiles: Map<string, FakeFileHandle>;
  getDirectoryHandle: ReturnType<typeof vi.fn>;
  getFileHandle: ReturnType<typeof vi.fn>;
}

function makeFakeDir(name: string): FakeDirectoryHandle {
  const dir: FakeDirectoryHandle = {
    name,
    childDirs: new Map(),
    childFiles: new Map(),
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi.fn(),
  };
  dir.getDirectoryHandle.mockImplementation(
    async (childName: string, options?: { create?: boolean }) => {
      const existing = dir.childDirs.get(childName);
      if (existing !== undefined) return existing;
      if (options?.create !== true) {
        throw new DOMException(`NotFoundError: ${childName}`, 'NotFoundError');
      }
      const fresh = makeFakeDir(childName);
      dir.childDirs.set(childName, fresh);
      return fresh;
    },
  );
  dir.getFileHandle.mockImplementation(
    async (fileName: string, options?: { create?: boolean }) => {
      const existing = dir.childFiles.get(fileName);
      if (existing !== undefined) return existing;
      if (options?.create !== true) {
        throw new DOMException(`NotFoundError: ${fileName}`, 'NotFoundError');
      }
      const writable: FakeWritable = { written: [], closed: false };
      const fileHandle: FakeFileHandle = {
        name: fileName,
        writable,
        createWritable: vi.fn(async () => ({
          write: vi.fn(async (data: string) => {
            writable.written.push(data);
          }),
          close: vi.fn(async () => {
            writable.closed = true;
          }),
        })),
      };
      dir.childFiles.set(fileName, fileHandle);
      return fileHandle;
    },
  );
  return dir;
}

/**
 * Seed a file into the fake tree without going through the write helper, so
 * existing-file scenarios can be set up without writing twice.
 */
function seedFile(dir: FakeDirectoryHandle, name: string, contents: string): void {
  const writable: FakeWritable = { written: [contents], closed: true };
  dir.childFiles.set(name, {
    name,
    writable,
    createWritable: vi.fn(),
  });
}

let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarn.mockRestore();
});

// ---------------------------------------------------------------------------
// needsBootstrap
// ---------------------------------------------------------------------------

describe('needsBootstrap', () => {
  it('returns true when the repo has no package.json', async () => {
    const root = makeFakeDir('ucm-tests');
    await expect(needsBootstrap(root as unknown as FileSystemDirectoryHandle)).resolves.toBe(true);
  });

  it('returns false when a package.json already exists', async () => {
    const root = makeFakeDir('ucm-tests');
    seedFile(root, 'package.json', '{ "name": "existing" }');
    await expect(needsBootstrap(root as unknown as FileSystemDirectoryHandle)).resolves.toBe(false);
  });

  it('returns false on unexpected probe errors (fails safe, does not bootstrap)', async () => {
    const root = makeFakeDir('ucm-tests');
    root.getFileHandle.mockImplementationOnce(async () => {
      throw new Error('permission revoked');
    });
    await expect(needsBootstrap(root as unknown as FileSystemDirectoryHandle)).resolves.toBe(
      false,
    );
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ensureBootstrap
// ---------------------------------------------------------------------------

describe('ensureBootstrap', () => {
  it("skips and returns 'not-needed' when package.json already exists, without calling confirm", async () => {
    const root = makeFakeDir('ucm-tests');
    seedFile(root, 'package.json', '{ "name": "existing" }');
    const confirm = vi.fn(async () => true);

    const result = await ensureBootstrap(root as unknown as FileSystemDirectoryHandle, { confirm });

    expect(result).toEqual({ wrote: false, reason: 'not-needed' });
    expect(confirm).not.toHaveBeenCalled();
    // No new files written.
    expect(root.childFiles.size).toBe(1);
    expect(Array.from(root.childFiles.keys())).toEqual(['package.json']);
  });

  it('calls confirm and writes all five scaffold files when the user confirms', async () => {
    const root = makeFakeDir('ucm-tests');
    const confirm = vi.fn(async () => true);

    const result = await ensureBootstrap(root as unknown as FileSystemDirectoryHandle, { confirm });

    expect(result).toEqual({ wrote: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    // Four files at the repo root + the workflow nested under .github/workflows/.
    expect(Array.from(root.childFiles.keys()).sort()).toEqual(
      ['.gitignore', 'README.md', 'package.json', 'playwright.config.ts'].sort(),
    );
    const githubDir = root.childDirs.get('.github');
    const workflowsDir = githubDir?.childDirs.get('workflows');
    expect(workflowsDir?.childFiles.get('playwright.yml')).toBeDefined();
  });

  it("calls confirm, writes nothing, and returns 'declined' when the user says no", async () => {
    const root = makeFakeDir('ucm-tests');
    const confirm = vi.fn(async () => false);

    const result = await ensureBootstrap(root as unknown as FileSystemDirectoryHandle, { confirm });

    expect(result).toEqual({ wrote: false, reason: 'declined' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(root.childFiles.size).toBe(0);
    expect(root.childDirs.size).toBe(0);
  });

  it('writes scaffold contents that match the exported template constants', async () => {
    const root = makeFakeDir('ucm-tests');
    await ensureBootstrap(root as unknown as FileSystemDirectoryHandle, {
      confirm: async () => true,
    });

    expect(root.childFiles.get('package.json')?.writable.written).toEqual([BOOTSTRAP_PACKAGE_JSON]);
    expect(root.childFiles.get('playwright.config.ts')?.writable.written).toEqual([
      BOOTSTRAP_PLAYWRIGHT_CONFIG,
    ]);
    expect(root.childFiles.get('.gitignore')?.writable.written).toEqual([BOOTSTRAP_GITIGNORE]);
    expect(root.childFiles.get('README.md')?.writable.written).toEqual([BOOTSTRAP_README]);
    const workflow = root.childDirs
      .get('.github')
      ?.childDirs.get('workflows')
      ?.childFiles.get('playwright.yml');
    expect(workflow?.writable.written).toEqual([BOOTSTRAP_GITHUB_WORKFLOW]);
  });
});

// ---------------------------------------------------------------------------
// Template content sanity — non-empty + key strings present.
//
// These guard against accidental edits that gut the scaffold (e.g. someone
// deletes the testMatch line and the repo now finds nothing). They're cheap.
// ---------------------------------------------------------------------------

describe('bootstrap templates', () => {
  it('package.json is valid JSON with @playwright/test pinned and the expected scripts', () => {
    const parsed = JSON.parse(BOOTSTRAP_PACKAGE_JSON) as {
      name: string;
      private: boolean;
      type: string;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.name).toBe('webspec-tests');
    expect(parsed.private).toBe(true);
    expect(parsed.type).toBe('module');
    expect(parsed.scripts.test).toBe('playwright test');
    expect(parsed.scripts['test:ui']).toBe('playwright test --ui');
    expect(parsed.devDependencies['@playwright/test']).toMatch(/^\^1\./);
  });

  it('playwright.config.ts uses defineConfig and matches both test directories', () => {
    expect(BOOTSTRAP_PLAYWRIGHT_CONFIG).toContain("import { defineConfig } from '@playwright/test'");
    expect(BOOTSTRAP_PLAYWRIGHT_CONFIG).toContain('defineConfig');
    expect(BOOTSTRAP_PLAYWRIGHT_CONFIG).toContain("'test-cases/**/*.spec.ts'");
    expect(BOOTSTRAP_PLAYWRIGHT_CONFIG).toContain("'tests/queue-*-*.spec.ts'");
    expect(BOOTSTRAP_PLAYWRIGHT_CONFIG).toContain('docs/10-team-shareability.md');
  });

  it('.gitignore covers node_modules and Playwright artifacts', () => {
    expect(BOOTSTRAP_GITIGNORE).toContain('node_modules/');
    expect(BOOTSTRAP_GITIGNORE).toContain('test-results/');
    expect(BOOTSTRAP_GITIGNORE).toContain('playwright-report/');
  });

  it('README mentions install + run commands and both layout dirs', () => {
    expect(BOOTSTRAP_README).toContain('npm install');
    expect(BOOTSTRAP_README).toContain('npm test');
    expect(BOOTSTRAP_README).toContain('npm run test:ui');
    expect(BOOTSTRAP_README).toContain('test-cases/');
    expect(BOOTSTRAP_README).toContain('tests/');
  });

  it('README documents the CI workflow + secrets caveat', () => {
    expect(BOOTSTRAP_README).toContain('## CI');
    expect(BOOTSTRAP_README).toContain('.github/workflows/playwright.yml');
    expect(BOOTSTRAP_README).toContain('Secrets caveat');
    expect(BOOTSTRAP_README).toContain('never commit production credentials');
  });

  it('GitHub workflow runs Playwright on push + PR with chromium + uploads the report', () => {
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('name: Playwright tests');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('on:');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('push:');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('pull_request:');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('workflow_dispatch');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('actions/checkout@v4');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('actions/setup-node@v4');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('node-version: 20');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('npm ci');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('npx playwright install --with-deps chromium');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('npm test');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('actions/upload-artifact@v4');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('playwright-report');
    expect(BOOTSTRAP_GITHUB_WORKFLOW).toContain('if: always()');
  });
});
