/**
 * Repo-scoped helpers for v1.4 Queues.
 *
 * The composer needs to (a) list every Test Case the user has saved (each
 * lives in `<repo>/test-cases/<slug>/`) and (b) read / write Queue manifests
 * under `<repo>/tests/queue-<n>-<slug>.json`. The rendered Playwright spec
 * file (`queue-<n>-<slug>.spec.ts`) is the renderer's concern in v1.4.1; this
 * module is the manifest layer only.
 *
 * All operations go through a `FileSystemDirectoryHandle` — the same handle
 * the Settings → General "Test repo folder" picker stashes in IndexedDB.
 * Callers are expected to have already confirmed `queryPermission` is granted.
 */
import {
  QueueSchema,
  queueManifestFilename,
  type Queue,
} from '@webspec/core/browser';
import { writeFileToRepoFolder } from './repoFolder.js';

/**
 * Lightweight Test Case descriptor for the composer's dropdown. Reading the
 * full `WorkflowRecording` for every Test Case at panel-open time would be
 * wasteful — the composer only needs the slug (the directory name) plus the
 * recording's human-readable name and the recorded `runAs` (so we can pre-fill
 * the step's `runAs` when the user picks this Test Case).
 */
export interface TestCaseSummary {
  slug: string;
  name: string;
  runAs: string;
}

/**
 * Stored Queue + its position number on disk (the `<n>` in `queue-<n>-<slug>.json`).
 * Position is what keeps the directory listing ordered. New queues get
 * `max(existing position) + 1`.
 */
export interface StoredQueue {
  queue: Queue;
  position: number;
}

async function tryGetDirectory(
  root: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await root.getDirectoryHandle(name, { create: false });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null;
    throw err;
  }
}

async function readFileText(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dir.getFileHandle(name, { create: false });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null;
    throw err;
  }
  const file = await fileHandle.getFile();
  return await file.text();
}

/**
 * Scan `<repo>/test-cases/` and return one summary per subdirectory that
 * holds a parseable `recording.json`. Subdirectories without a recording
 * (or with a malformed one) are silently skipped — the composer's job is to
 * surface usable Test Cases, not to validate the entire library.
 */
export async function listTestCases(
  root: FileSystemDirectoryHandle,
): Promise<TestCaseSummary[]> {
  const testCasesDir = await tryGetDirectory(root, 'test-cases');
  if (testCasesDir === null) return [];

  const out: TestCaseSummary[] = [];
  for await (const entry of testCasesDir.values()) {
    if (entry.kind !== 'directory') continue;
    const slug = entry.name;
    const dir = entry as FileSystemDirectoryHandle;
    const raw = await readFileText(dir, 'recording.json');
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name : slug;
      const runAs = typeof obj.runAs === 'string' ? obj.runAs : '';
      out.push({ slug, name, runAs });
    } catch {
      // Skip unreadable recordings; the user can re-save from the popup.
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Scan `<repo>/tests/` for `queue-<n>-<slug>.json` manifests. Returns them in
 * ascending position order. Malformed entries are logged + skipped.
 */
export async function listQueues(
  root: FileSystemDirectoryHandle,
): Promise<StoredQueue[]> {
  const testsDir = await tryGetDirectory(root, 'tests');
  if (testsDir === null) return [];

  const out: StoredQueue[] = [];
  const filenameRe = /^queue-(\d+)-[a-z0-9-]+\.json$/i;
  for await (const entry of testsDir.values()) {
    if (entry.kind !== 'file') continue;
    const match = filenameRe.exec(entry.name);
    if (!match) continue;
    const position = Number(match[1]);
    const raw = await readFileText(testsDir, entry.name);
    if (raw === null) continue;
    try {
      const parsed = QueueSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        console.warn(`[webspec] queue manifest "${entry.name}" failed to parse`, parsed.error);
        continue;
      }
      out.push({ queue: parsed.data, position });
    } catch (err) {
      console.warn(`[webspec] queue manifest "${entry.name}" unreadable`, err);
    }
  }
  out.sort((a, b) => a.position - b.position);
  return out;
}

export function nextQueuePosition(existing: StoredQueue[]): number {
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((q) => q.position)) + 1;
}

/**
 * Write a Queue manifest to `<repo>/tests/queue-<position>-<slug>.json`.
 * Overwrites the file if it already exists — the user is editing this Queue.
 */
export async function saveQueueManifest(
  root: FileSystemDirectoryHandle,
  position: number,
  queue: Queue,
): Promise<string> {
  const relPath = `tests/${queueManifestFilename(position, queue.slug)}`;
  await writeFileToRepoFolder(root, relPath, JSON.stringify(queue, null, 2) + '\n');
  return relPath;
}
