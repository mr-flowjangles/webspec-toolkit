/**
 * Repo-scoped helpers for v1.4 Queues.
 *
 * The composer needs to (a) list every Test Case the user has saved (each
 * lives in `<repo>/test-cases/<slug>/`) and (b) read / write Queue manifests
 * under `<repo>/tests/queue-<n>-<slug>.json`. v1.4.1 added (c) rendering the
 * Queue to a Playwright spec written alongside the manifest as
 * `queue-<n>-<slug>.spec.ts`.
 *
 * All operations go through a `FileSystemDirectoryHandle` — the same handle
 * the Settings → General "Test repo folder" picker stashes in IndexedDB.
 * Callers are expected to have already confirmed `queryPermission` is granted.
 */
import {
  QueueSchema,
  queueManifestFilename,
  queueSpecFilename,
  renderQueueSpec,
  renderTestCaseModule,
  type AuthProfileList,
  type Queue,
  type RecordingInput,
  type RecordingOutput,
  type WorkflowRecording,
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
  /**
   * v1.6.3 — declared parametric inputs from `recording.json`. Empty array
   * when the recording is pre-v1.6 or the user declared no inputs. Used by
   * the Queue composer to render an input-wiring subsection per step.
   */
  inputs: RecordingInput[];
  /**
   * v1.6.3 — declared outputs from `recording.json`. Used by the Queue
   * composer to populate the "from step N → outputName" dropdown for later
   * steps wiring their inputs to earlier outputs.
   */
  outputs: RecordingOutput[];
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
      // v1.6.3 — pull declared inputs/outputs if present. We accept whatever
      // shape is on disk (the schema's defaults handle pre-v1.6 recordings
      // with these fields missing); the composer can trust the array shape
      // but should not assume schema-perfect contents at this layer.
      const inputs = Array.isArray(obj.inputs) ? (obj.inputs as RecordingInput[]) : [];
      const outputs = Array.isArray(obj.outputs) ? (obj.outputs as RecordingOutput[]) : [];
      out.push({ slug, name, runAs, inputs, outputs });
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

/**
 * Read each Test Case slug referenced by a Queue and return the parsed
 * `WorkflowRecording`s as a Map keyed by slug — the shape `renderQueueSpec`
 * consumes. Throws if a referenced slug has no `recording.json` on disk, or
 * if the file fails schema validation: the spec render can't proceed with
 * a hole in the recordings.
 */
export async function loadRecordingsForQueue(
  root: FileSystemDirectoryHandle,
  queue: Queue,
): Promise<Map<string, WorkflowRecording>> {
  const testCasesDir = await tryGetDirectory(root, 'test-cases');
  if (testCasesDir === null) {
    throw new Error(
      `No test-cases/ directory under the configured Test repo folder; cannot render Queue "${queue.name}".`,
    );
  }
  const slugs = new Set(queue.steps.map((s) => s.testCase));
  const out = new Map<string, WorkflowRecording>();
  for (const slug of slugs) {
    const dir = await tryGetDirectory(testCasesDir, slug);
    if (dir === null) {
      throw new Error(
        `Test Case "${slug}" referenced by Queue "${queue.name}" is missing from <repo>/test-cases/.`,
      );
    }
    const raw = await readFileText(dir, 'recording.json');
    if (raw === null) {
      throw new Error(
        `Test Case "${slug}" has no recording.json — re-save it from the extension popup.`,
      );
    }
    try {
      out.set(slug, JSON.parse(raw) as WorkflowRecording);
    } catch (err) {
      throw new Error(
        `Test Case "${slug}" has an unreadable recording.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return out;
}

/**
 * v1.5.0 self-heal: ensure each referenced Test Case has a `recording.ts`
 * helper module on disk. Test Cases saved pre-v1.5.0 have only the
 * inlined `recording.spec.ts`; this renders the new helper from
 * `recording.json` for any missing one so the Queue's import-based spec
 * can resolve. No-op when the helper already exists.
 *
 * Returns the slugs that were regenerated (for UI reporting if useful).
 */
export async function ensureTestCaseHelpers(
  root: FileSystemDirectoryHandle,
  recordings: Map<string, WorkflowRecording>,
): Promise<string[]> {
  const testCasesDir = await tryGetDirectory(root, 'test-cases');
  if (testCasesDir === null) return [];
  const written: string[] = [];
  for (const [slug, recording] of recordings) {
    const dir = await tryGetDirectory(testCasesDir, slug);
    if (dir === null) continue; // missing dir is loadRecordingsForQueue's problem
    const existing = await readFileText(dir, 'recording.ts');
    if (existing !== null) continue;
    const helper = renderTestCaseModule(recording);
    await writeFileToRepoFolder(root, `test-cases/${slug}/recording.ts`, helper);
    written.push(slug);
  }
  return written;
}

/**
 * Save the Queue manifest AND render+write the Playwright spec alongside it.
 * Returns the paths written so the UI can report them.
 *
 * Two-file output keeps the manifest as the editable source of truth and
 * the spec as the regenerable file Playwright actually runs (per docs/10
 * § 4 "Queue artifact on disk"). The spec is overwritten on every Save —
 * the manifest is the editable artifact; never hand-edit the spec.
 *
 * v1.5.0: before rendering, ensures every referenced Test Case has a
 * `recording.ts` helper module on disk (self-heals legacy pre-v1.5.0
 * Test Cases that only have the inlined spec).
 */
export async function saveQueueWithSpec(
  root: FileSystemDirectoryHandle,
  position: number,
  queue: Queue,
  authProfiles: AuthProfileList,
): Promise<{ manifestPath: string; specPath: string; healedHelpers: string[] }> {
  const recordings = await loadRecordingsForQueue(root, queue);
  const healedHelpers = await ensureTestCaseHelpers(root, recordings);
  const specSource = renderQueueSpec({ queue, recordings, authProfiles });
  const manifestPath = await saveQueueManifest(root, position, queue);
  const specRelPath = `tests/${queueSpecFilename(position, queue.slug)}`;
  await writeFileToRepoFolder(root, specRelPath, specSource);
  return { manifestPath, specPath: specRelPath, healedHelpers };
}
