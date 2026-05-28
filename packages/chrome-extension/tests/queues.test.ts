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
  ensureTestCaseHelpers,
  listQueues,
  listTestCases,
  loadRecordingsForQueue,
  nextQueuePosition,
  saveQueueManifest,
  saveQueueWithSpec,
  type StoredQueue,
} from '../src/shared/queues.js';
import type { Queue, WorkflowRecording } from '@webspec/core/browser';

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
    expect(result).toEqual([
      { slug: 'create-lead', name: 'Create Lead', runAs: 'TTIDUMWSUP', inputs: [], outputs: [] },
    ]);
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
    expect(result).toEqual([
      { slug: 'no-meta', name: 'no-meta', runAs: '', inputs: [], outputs: [] },
    ]);
  });

  it('surfaces declared inputs and outputs from recording.json (v1.6.3)', async () => {
    const root = makeFakeDir('repo');
    const testCases = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await testCases.getDirectoryHandle('create-lead', { create: true });
    const recording = JSON.stringify({
      name: 'Create Lead',
      runAs: 'X',
      inputs: [{ name: 'leadName', eventIndex: 3 }],
      outputs: [
        { name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } },
      ],
    });
    dir.childFiles.set('recording.json', makeFakeFile('recording.json', recording));

    const result = await listTestCases(asHandle(root));
    expect(result).toEqual([
      {
        slug: 'create-lead',
        name: 'Create Lead',
        runAs: 'X',
        inputs: [{ name: 'leadName', eventIndex: 3 }],
        outputs: [
          { name: 'leadId', source: { kind: 'url', pattern: '/leads/(\\d+)' } },
        ],
      },
    ]);
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

// ---------------------------------------------------------------------------
// v1.5.0 — Test Case helper self-heal at Queue render time.
// ---------------------------------------------------------------------------

const SAMPLE_RECORDING: WorkflowRecording = {
  name: 'Create Lead',
  description: 'Creates a lead.',
  runAs: null,
  auth: null,
  startedAt: '2026-05-20T00:00:00.000Z',
  endedAt: '2026-05-20T00:00:05.000Z',
  startUrl: 'http://app.ucm-dev.cmscloud.local/x',
  events: [
    {
      t: 100,
      kind: 'click',
      selector: { preferred: 'role=button[name="Go"]', strategy: 'role', fallbacks: [] },
    },
  ],
  network: [],
  framework: 'playwright',
};

describe('ensureTestCaseHelpers', () => {
  it('writes recording.ts when missing', async () => {
    const root = makeFakeDir('repo');
    const tc = await root.getDirectoryHandle('test-cases', { create: true });
    await tc.getDirectoryHandle('create-lead', { create: true });

    const recordings = new Map([['create-lead', SAMPLE_RECORDING]]);
    const written = await ensureTestCaseHelpers(asHandle(root), recordings);

    expect(written).toEqual(['create-lead']);
    const dir = root.childDirs.get('test-cases')?.childDirs.get('create-lead');
    const helper = dir?.childFiles.get('recording.ts');
    expect(helper).toBeDefined();
    expect(helper!.content).toContain('export async function run');
    expect(helper!.content).toContain('@playwright/test');
  });

  it('does NOT overwrite an existing recording.ts (the user may have edited it)', async () => {
    const root = makeFakeDir('repo');
    const tc = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await tc.getDirectoryHandle('create-lead', { create: true });
    dir.childFiles.set(
      'recording.ts',
      makeFakeFile('recording.ts', '// hand-edited\nexport async function run() {}'),
    );

    const recordings = new Map([['create-lead', SAMPLE_RECORDING]]);
    const written = await ensureTestCaseHelpers(asHandle(root), recordings);

    expect(written).toEqual([]);
    const helper = dir.childFiles.get('recording.ts');
    expect(helper!.content).toBe('// hand-edited\nexport async function run() {}');
  });

  it('returns an empty list when test-cases/ does not exist (loadRecordingsForQueue will throw first)', async () => {
    const root = makeFakeDir('repo');
    const recordings = new Map([['create-lead', SAMPLE_RECORDING]]);
    expect(await ensureTestCaseHelpers(asHandle(root), recordings)).toEqual([]);
  });
});

describe('loadRecordingsForQueue', () => {
  it('returns recordings for every referenced slug', async () => {
    const root = makeFakeDir('repo');
    const tc = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await tc.getDirectoryHandle('create-lead', { create: true });
    dir.childFiles.set(
      'recording.json',
      makeFakeFile('recording.json', JSON.stringify(SAMPLE_RECORDING)),
    );

    const queue: Queue = {
      ...VALID_QUEUE,
      steps: [{ testCase: 'create-lead', runAs: 'X' }],
    };
    const recordings = await loadRecordingsForQueue(asHandle(root), queue);
    expect(recordings.size).toBe(1);
    expect(recordings.get('create-lead')?.name).toBe('Create Lead');
  });

  it('throws when a referenced Test Case has no recording.json', async () => {
    const root = makeFakeDir('repo');
    const tc = await root.getDirectoryHandle('test-cases', { create: true });
    await tc.getDirectoryHandle('create-lead', { create: true }); // dir but no file

    const queue: Queue = {
      ...VALID_QUEUE,
      steps: [{ testCase: 'create-lead', runAs: 'X' }],
    };
    await expect(loadRecordingsForQueue(asHandle(root), queue)).rejects.toThrow(/no recording\.json/);
  });
});

describe('saveQueueWithSpec — self-heal integration', () => {
  it('writes the spec, the manifest, AND the missing helper module', async () => {
    const root = makeFakeDir('repo');
    const tc = await root.getDirectoryHandle('test-cases', { create: true });
    const dir = await tc.getDirectoryHandle('seed-leads', { create: true });
    dir.childFiles.set(
      'recording.json',
      makeFakeFile('recording.json', JSON.stringify(SAMPLE_RECORDING)),
    );

    const queue: Queue = { ...VALID_QUEUE, steps: [{ testCase: 'seed-leads', runAs: 'X' }] };
    const result = await saveQueueWithSpec(asHandle(root), 1, queue, []);

    expect(result.manifestPath).toBe('tests/queue-1-seed-leads.json');
    expect(result.specPath).toBe('tests/queue-1-seed-leads.spec.ts');
    expect(result.healedHelpers).toEqual(['seed-leads']);

    const spec = root.childDirs.get('tests')?.childFiles.get('queue-1-seed-leads.spec.ts');
    expect(spec).toBeDefined();
    expect(spec!.content).toContain(`import { run as seedLeads } from '../test-cases/seed-leads/recording.js';`);

    const helper = dir.childFiles.get('recording.ts');
    expect(helper).toBeDefined();
    expect(helper!.content).toContain('export async function run');
  });
});
