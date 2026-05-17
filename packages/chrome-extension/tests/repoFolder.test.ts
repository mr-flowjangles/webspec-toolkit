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
import { loadRepoFolderInfo, type RepoFolderInfo } from '../src/shared/repoFolder.js';

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
