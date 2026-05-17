// @vitest-environment happy-dom

/**
 * Tests for the v1.4 repo-folder storage module.
 *
 * `repoFolder.ts` wraps two browser APIs we can't run in Node — `IndexedDB`
 * (for the FileSystemDirectoryHandle) and `chrome.storage.local` (for the
 * display-name mirror). We mock `chrome.storage.local` and exercise the
 * read-path logic that matters for safety: malformed entries must produce a
 * graceful `null` rather than crash a Settings page.
 *
 * The IndexedDB write/read paths and the File System Access permission
 * helpers are not covered here — they're thin pass-throughs to browser
 * APIs and real bugs in them surface only against a real Chrome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadRepoFolderInfo,
  writeFileToRepoFolder,
  type RepoFolderInfo,
} from '../src/shared/repoFolder.js';

interface ChromeStorageStub {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
}

function installChromeStorageStub(): ChromeStorageStub {
  const store: Record<string, unknown> = {};
  const get = vi.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(store, key) ? { [key]: store[key] } : {},
  );
  // Minimal stand-in for the `chrome.storage.local` surface the module uses.
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get,
        // set/remove aren't used by loadRepoFolderInfo but are referenced
        // by other module exports; stub them so any incidental import-time
        // touch doesn't blow up.
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
  };
  return { store, get };
}

let chromeStub: ChromeStorageStub;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  chromeStub = installChromeStorageStub();
  // Suppress the warn the module emits on malformed data; assert call count
  // when we care, otherwise keep test output clean.
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarn.mockRestore();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('loadRepoFolderInfo', () => {
  it('returns null when the storage key is empty', async () => {
    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('returns the stored value when it is well-formed', async () => {
    const info: RepoFolderInfo = { name: 'ucm-tests', setAt: 1_700_000_000_000 };
    chromeStub.store['webspec.repoFolder'] = info;

    const result = await loadRepoFolderInfo();
    expect(result).toEqual(info);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('returns null and warns when the stored value is not an object', async () => {
    chromeStub.store['webspec.repoFolder'] = 'not-an-object';

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('returns null when the stored value is null', async () => {
    chromeStub.store['webspec.repoFolder'] = null;

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('returns null when `name` is missing', async () => {
    chromeStub.store['webspec.repoFolder'] = { setAt: 1_700_000_000_000 };

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('returns null when `name` is the wrong type', async () => {
    chromeStub.store['webspec.repoFolder'] = { name: 42, setAt: 1_700_000_000_000 };

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('returns null when `setAt` is missing', async () => {
    chromeStub.store['webspec.repoFolder'] = { name: 'ucm-tests' };

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('returns null when `setAt` is the wrong type', async () => {
    chromeStub.store['webspec.repoFolder'] = { name: 'ucm-tests', setAt: '2026-05-17' };

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs when chrome.storage.local.get rejects', async () => {
    chromeStub.get.mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await loadRepoFolderInfo();
    expect(result).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// writeFileToRepoFolder — path-walk + write-helper logic.
//
// Mocks a directory-handle tree so we can assert which segments get traversed
// vs created. The real File System Access API is exercised only against a
// real Chrome — these tests cover the bookkeeping that wraps it.
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

describe('writeFileToRepoFolder', () => {
  it('writes a single-segment file directly under root', async () => {
    const root = makeFakeDir('ucm-tests');

    await writeFileToRepoFolder(
      root as unknown as FileSystemDirectoryHandle,
      'README.md',
      '# hello',
    );

    expect(root.getDirectoryHandle).not.toHaveBeenCalled();
    expect(root.getFileHandle).toHaveBeenCalledWith('README.md', { create: true });
    const file = root.childFiles.get('README.md');
    expect(file?.writable.written).toEqual(['# hello']);
    expect(file?.writable.closed).toBe(true);
  });

  it('creates intermediate directories with create: true', async () => {
    const root = makeFakeDir('ucm-tests');

    await writeFileToRepoFolder(
      root as unknown as FileSystemDirectoryHandle,
      'test-cases/create-lead/recording.json',
      '{}',
    );

    expect(root.getDirectoryHandle).toHaveBeenCalledWith('test-cases', { create: true });
    const testCases = root.childDirs.get('test-cases');
    expect(testCases?.getDirectoryHandle).toHaveBeenCalledWith('create-lead', { create: true });
    const createLead = testCases?.childDirs.get('create-lead');
    expect(createLead?.getFileHandle).toHaveBeenCalledWith('recording.json', { create: true });
    expect(createLead?.childFiles.get('recording.json')?.writable.written).toEqual(['{}']);
  });

  it('reuses an existing directory rather than re-creating it', async () => {
    const root = makeFakeDir('ucm-tests');

    await writeFileToRepoFolder(
      root as unknown as FileSystemDirectoryHandle,
      'test-cases/a/foo.txt',
      'one',
    );
    await writeFileToRepoFolder(
      root as unknown as FileSystemDirectoryHandle,
      'test-cases/b/bar.txt',
      'two',
    );

    // Same `test-cases` directory should be reused for both writes —
    // the mock returns the cached child on the second call.
    expect(root.childDirs.size).toBe(1);
    expect(root.childDirs.get('test-cases')?.childDirs.size).toBe(2);
  });

  it('rejects an empty path', async () => {
    const root = makeFakeDir('ucm-tests');
    await expect(
      writeFileToRepoFolder(root as unknown as FileSystemDirectoryHandle, '', 'hi'),
    ).rejects.toThrow(/Invalid relative path/);
  });

  it('rejects a path with a leading slash', async () => {
    const root = makeFakeDir('ucm-tests');
    await expect(
      writeFileToRepoFolder(root as unknown as FileSystemDirectoryHandle, '/foo.txt', 'hi'),
    ).rejects.toThrow(/Invalid relative path/);
  });

  it('rejects a path with a doubled slash', async () => {
    const root = makeFakeDir('ucm-tests');
    await expect(
      writeFileToRepoFolder(root as unknown as FileSystemDirectoryHandle, 'a//b.txt', 'hi'),
    ).rejects.toThrow(/Invalid relative path/);
  });

  it('closes the writable even if write() throws', async () => {
    const root = makeFakeDir('ucm-tests');

    // First call: get the real file handle the helper would have created.
    const fileHandle: FakeFileHandle = {
      name: 'broken.txt',
      writable: { written: [], closed: false },
      createWritable: vi.fn(async () => ({
        write: vi.fn(async () => {
          throw new Error('disk full');
        }),
        close: vi.fn(async () => {
          fileHandle.writable.closed = true;
        }),
      })),
    };
    root.childFiles.set('broken.txt', fileHandle);

    await expect(
      writeFileToRepoFolder(
        root as unknown as FileSystemDirectoryHandle,
        'broken.txt',
        'hi',
      ),
    ).rejects.toThrow(/disk full/);
    expect(fileHandle.writable.closed).toBe(true);
  });
});
