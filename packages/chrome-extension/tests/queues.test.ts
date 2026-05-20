// @vitest-environment happy-dom

/**
 * Tests for the v1.4 Queue storage helpers.
 *
 * `queues.ts` walks a `FileSystemDirectoryHandle` tree to discover saved
 * Test Cases (subdirs under `<repo>/test-cases/`) and stored Queue manifests
 * (files matching `<repo>/tests/queue-<n>-<slug>.json`). The real FS Access
 * API runs only against a live Chrome — these tests cover the bookkeeping
 * (path walk, malformed-entry skip, ordering, filename construction) against
 * a fake handle tree that mirrors the shape `repoFolder.test.ts` uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listQueues,
  listTestCases,
  nextQueuePosition,
  saveQueueManifest,
  type StoredQueue,
} from '../src/shared/queues.js';
import type { Queue } from '@webspec/core/browser';

interface FakeWritable {
  written: string[];
  closed: boolean;
}

interface FakeFileHandle {
  kind: 'file';
  name: string;
  content: string;
  writable: FakeWritable;
  getFile: () => Promise<{ text: () => Promise<string> }>;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface FakeDirectoryHandle {
  kind: 'directory';
  name: string;
  childDirs: Map<string, FakeDirectoryHandle>;
  childFiles: Map<string, FakeFileHandle>;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FakeDirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FakeFileHandle>;
  values: () => AsyncIterableIterator<FakeDirectoryHandle | FakeFileHandle>;
}

function makeFakeFile(name: string, content: string): FakeFileHandle {
  const writable: FakeWritable = { written: [], closed: false };
  const handle: FakeFileHandle = {
    kind: 'file',
    name,
    content,
    writable,
    getFile: async () => ({ text: async () => handle.content }),
    createWritable: async () => ({
      write: async (data: string) => {
        writable.written.push(data);
        handle.content = data;
      },
      close: async () => {
        writable.closed = true;
      },
    }),
  };
  return handle;
}

function makeFakeDir(name: string): FakeDirectoryHandle {
  const dir: FakeDirectoryHandle = {
    kind: 'directory',
    name,
    childDirs: new Map(),
    childFiles: new Map(),
    async getDirectoryHandle(childName, options) {
      const existing = dir.childDirs.get(childName);
      if (existing !== undefined) return existing;
      if (options?.create !== true) {
        throw new DOMException(`NotFoundError: ${childName}`, 'NotFoundError');
      }
      const fresh = makeFakeDir(childName);
      dir.childDirs.set(childName, fresh);
      return fresh;
    },
    async getFileHandle(fileName, options) {
      const existing = dir.childFiles.get(fileName);
      if (existing !== undefined) return existing;
      if (options?.create !== true) {
        throw new DOMException(`NotFoundError: ${fileName}`, 'NotFoundError');
      }
      const fresh = makeFakeFile(fileName, '');
      dir.childFiles.set(fileName, fresh);
      return fresh;
    },
    async *values() {
      for (const d of dir.childDirs.values()) yield d;
      for (const f of dir.childFiles.values()) yield f;
    },
  };
  return dir;
}

function asHandle(dir: FakeDirectoryHandle): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle;
}

let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarn.mockRestore();
});

const VALID_RECORDING = JSON.stringify({ name: 'Create Lead', runAs: 'TTIDUMWSUP' });

const VALID_QUEUE: Queue = {
  schemaVersion: 1,
  id: 'q1',
  name: 'Seed Leads',
  slug: 'seed-leads',
  steps: [{ testCase: 'create-lead', runAs: 'TTIDUMWSUP' }],
  inputs: [],
};

describe('listTestCases', () => {
  it('returns an empty list when test-cases/ does not exist', async () => {
    const root = makeFakeDir('repo');
    const result = await listTestCases(asHandle(root));
    expect(result).toEqual([]);
  });

  it('returns one summary per Test Case directory with a parseable recording', async () => {
    const root = makeFakeDir('repo');
    const testCases = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await testCases.getDirectoryHandle('create-lead', { create: true });
    dir.childFiles.set('recording.json', makeFakeFile('recording.json', VALID_RECORDING));

    const result = await listTestCases(asHandle(root));
    expect(result).toEqual([{ slug: 'create-lead', name: 'Create Lead', runAs: 'TTIDUMWSUP' }]);
  });

  it('skips directories with no recording.json', async () => {
    const root = makeFakeDir('repo');
    const testCases = await root.getDirectoryHandle('test-cases', { create: true });
    await testCases.getDirectoryHandle('empty-dir', { create: true });

    const result = await listTestCases(asHandle(root));
    expect(result).toEqual([]);
  });

  it('skips directories with unparseable recording.json', async () => {
    const root = makeFakeDir('repo');
    const testCases = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await testCases.getDirectoryHandle('busted', { create: true });
    dir.childFiles.set('recording.json', makeFakeFile('recording.json', '{not json'));

    const result = await listTestCases(asHandle(root));
    expect(result).toEqual([]);
  });

  it('falls back to slug + empty runAs when fields are missing', async () => {
    const root = makeFakeDir('repo');
    const testCases = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await testCases.getDirectoryHandle('no-meta', { create: true });
    dir.childFiles.set('recording.json', makeFakeFile('recording.json', '{}'));

    const result = await listTestCases(asHandle(root));
    expect(result).toEqual([{ slug: 'no-meta', name: 'no-meta', runAs: '' }]);
  });

  it('sorts results by name', async () => {
    const root = makeFakeDir('repo');
    const testCases = await root.getDirectoryHandle('test-cases', { create: true });
    const a = await testCases.getDirectoryHandle('z-slug', { create: true });
    a.childFiles.set('recording.json', makeFakeFile('recording.json', JSON.stringify({ name: 'Apple' })));
    const b = await testCases.getDirectoryHandle('a-slug', { create: true });
    b.childFiles.set('recording.json', makeFakeFile('recording.json', JSON.stringify({ name: 'Zebra' })));

    const result = await listTestCases(asHandle(root));
    expect(result.map((tc) => tc.name)).toEqual(['Apple', 'Zebra']);
  });
});

describe('listQueues', () => {
  it('returns an empty list when tests/ does not exist', async () => {
    const root = makeFakeDir('repo');
    expect(await listQueues(asHandle(root))).toEqual([]);
  });

  it('reads and parses matching manifests', async () => {
    const root = makeFakeDir('repo');
    const tests = await root.getDirectoryHandle('tests', { create: true });
    tests.childFiles.set(
      'queue-1-seed-leads.json',
      makeFakeFile('queue-1-seed-leads.json', JSON.stringify(VALID_QUEUE)),
    );

    const result = await listQueues(asHandle(root));
    expect(result).toHaveLength(1);
    expect(result[0]?.position).toBe(1);
    expect(result[0]?.queue.slug).toBe('seed-leads');
  });

  it('skips files that do not match the queue-N-<slug>.json pattern', async () => {
    const root = makeFakeDir('repo');
    const tests = await root.getDirectoryHandle('tests', { create: true });
    tests.childFiles.set('README.md', makeFakeFile('README.md', '# tests'));
    tests.childFiles.set(
      'queue-2-other.spec.ts',
      makeFakeFile('queue-2-other.spec.ts', 'test code'),
    );

    expect(await listQueues(asHandle(root))).toEqual([]);
  });

  it('skips manifests whose body fails schema validation', async () => {
    const root = makeFakeDir('repo');
    const tests = await root.getDirectoryHandle('tests', { create: true });
    tests.childFiles.set(
      'queue-1-busted.json',
      makeFakeFile('queue-1-busted.json', JSON.stringify({ schemaVersion: 1, name: 'x' })),
    );

    expect(await listQueues(asHandle(root))).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it('sorts manifests by ascending position', async () => {
    const root = makeFakeDir('repo');
    const tests = await root.getDirectoryHandle('tests', { create: true });
    tests.childFiles.set(
      'queue-3-c.json',
      makeFakeFile('queue-3-c.json', JSON.stringify({ ...VALID_QUEUE, slug: 'c' })),
    );
    tests.childFiles.set(
      'queue-1-a.json',
      makeFakeFile('queue-1-a.json', JSON.stringify({ ...VALID_QUEUE, slug: 'a' })),
    );
    tests.childFiles.set(
      'queue-2-b.json',
      makeFakeFile('queue-2-b.json', JSON.stringify({ ...VALID_QUEUE, slug: 'b' })),
    );

    const result = await listQueues(asHandle(root));
    expect(result.map((q) => q.position)).toEqual([1, 2, 3]);
  });
});

describe('nextQueuePosition', () => {
  it('returns 1 when no queues are stored', () => {
    expect(nextQueuePosition([])).toBe(1);
  });

  it('returns max-position + 1', () => {
    const stored: StoredQueue[] = [
      { position: 1, queue: { ...VALID_QUEUE, slug: 'a' } },
      { position: 4, queue: { ...VALID_QUEUE, slug: 'b' } },
      { position: 2, queue: { ...VALID_QUEUE, slug: 'c' } },
    ];
    expect(nextQueuePosition(stored)).toBe(5);
  });
});

describe('saveQueueManifest', () => {
  it('writes the manifest as JSON under tests/', async () => {
    const root = makeFakeDir('repo');

    const relPath = await saveQueueManifest(asHandle(root), 1, VALID_QUEUE);
    expect(relPath).toBe('tests/queue-1-seed-leads.json');

    const tests = root.childDirs.get('tests');
    const file = tests?.childFiles.get('queue-1-seed-leads.json');
    expect(file).toBeDefined();
    const parsed = JSON.parse(file!.content);
    expect(parsed).toEqual(VALID_QUEUE);
    expect(file!.writable.closed).toBe(true);
  });

  it('overwrites an existing manifest at the same position', async () => {
    const root = makeFakeDir('repo');
    await saveQueueManifest(asHandle(root), 1, VALID_QUEUE);

    const renamed: Queue = { ...VALID_QUEUE, name: 'Seed Leads (v2)' };
    await saveQueueManifest(asHandle(root), 1, renamed);

    const file = root.childDirs.get('tests')?.childFiles.get('queue-1-seed-leads.json');
    const parsed = JSON.parse(file!.content);
    expect(parsed.name).toBe('Seed Leads (v2)');
  });
});
