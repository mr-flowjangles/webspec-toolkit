/**
 * Repo folder storage for v1.4 Queues + Team Shareability.
 *
 * A `FileSystemDirectoryHandle` cannot be serialized to chrome.storage.local,
 * so the handle itself lives in IndexedDB (object store `repoFolder`, key
 * `current`). A small `RepoFolderInfo` (folder name + set timestamp) is
 * mirrored to chrome.storage.local for cheap reads from anywhere in the
 * extension that just needs to display the folder name.
 *
 * Permission status is NOT persisted — Chrome re-prompts after a browser
 * restart. Callers check `queryPermission` at use time; the Settings UI
 * exposes a "Re-grant access" affordance when status is `prompt`.
 */

export interface RepoFolderInfo {
  name: string;
  /** epoch ms */
  setAt: number;
}

const STORAGE_KEY = 'webspec.repoFolder';
const IDB_NAME = 'webspec';
const IDB_VERSION = 1;
const IDB_STORE = 'repoFolder';
const IDB_KEY = 'current';

function isRepoFolderInfo(v: unknown): v is RepoFolderInfo {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === 'string' && typeof o.setAt === 'number';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPutHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDeleteHandle(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadRepoFolderInfo(): Promise<RepoFolderInfo | null> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (raw === undefined) return null;
    if (!isRepoFolderInfo(raw)) {
      console.warn('[webspec] repo folder info malformed; ignoring');
      return null;
    }
    return raw;
  } catch (err) {
    console.warn('[webspec] failed to load repo folder info:', err);
    return null;
  }
}

export async function loadRepoFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await idbGetHandle();
    return handle ?? null;
  } catch (err) {
    console.warn('[webspec] failed to load repo folder handle:', err);
    return null;
  }
}

export async function saveRepoFolder(handle: FileSystemDirectoryHandle): Promise<RepoFolderInfo> {
  const info: RepoFolderInfo = { name: handle.name, setAt: Date.now() };
  await idbPutHandle(handle);
  await chrome.storage.local.set({ [STORAGE_KEY]: info });
  return info;
}

export async function clearRepoFolder(): Promise<void> {
  await idbDeleteHandle();
  await chrome.storage.local.remove(STORAGE_KEY);
}

export type RepoPermission = 'granted' | 'prompt' | 'denied';

export async function checkRepoPermission(handle: FileSystemDirectoryHandle): Promise<RepoPermission> {
  return handle.queryPermission({ mode: 'readwrite' });
}

export async function requestRepoPermission(handle: FileSystemDirectoryHandle): Promise<RepoPermission> {
  return handle.requestPermission({ mode: 'readwrite' });
}

/**
 * Write `content` to `relativePath` (e.g. `test-cases/create-lead/recording.json`)
 * under `rootHandle`. Creates intermediate directories as needed. Overwrites
 * any existing file at the leaf — Test Case saves are canonical-per-slug.
 *
 * Throws if `relativePath` is empty, contains an empty segment (leading slash,
 * trailing slash, `//`), or if the user's permission has been revoked.
 */
export async function writeFileToRepoFolder(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const parts = relativePath.split('/');
  if (parts.length === 0 || parts.some((p) => p === '')) {
    throw new Error(`Invalid relative path: "${relativePath}"`);
  }
  const fileName = parts[parts.length - 1];
  if (fileName === undefined) throw new Error(`Invalid relative path: "${relativePath}"`);

  let dir: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    if (segment === undefined) throw new Error(`Invalid relative path: "${relativePath}"`);
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}
