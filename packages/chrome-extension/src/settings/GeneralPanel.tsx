/**
 * v1.3.3 General panel — global Settings that affect all webspec workflows.
 *
 * For now: the **Test repo folder** field. Picks a directory via the
 * File System Access API and persists the handle (IndexedDB) + the folder
 * name (chrome.storage.local). Save-time integration (writing Test Cases
 * and Queue specs into the configured folder) lands in subsequent patches.
 *
 * See `docs/10-team-shareability.md` § Build-session decisions → 2. Repo path
 * configuration UX.
 */
import { useEffect, useState } from 'react';
import {
  checkRepoPermission,
  clearRepoFolder,
  loadRepoFolderHandle,
  loadRepoFolderInfo,
  requestRepoPermission,
  saveRepoFolder,
  type RepoFolderInfo,
  type RepoPermission,
} from '../shared/repoFolder.js';

type Status = 'idle' | 'working' | { error: string };

export function GeneralPanel(): JSX.Element {
  const [info, setInfo] = useState<RepoFolderInfo | null>(null);
  const [permission, setPermission] = useState<RepoPermission | 'unknown'>('unknown');
  const [status, setStatus] = useState<Status>('idle');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const i = await loadRepoFolderInfo();
      setInfo(i);
      if (i !== null) {
        const h = await loadRepoFolderHandle();
        if (h !== null) {
          const p = await checkRepoPermission(h);
          setPermission(p);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function pickFolder(): Promise<void> {
    setStatus('working');
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const saved = await saveRepoFolder(handle);
      const p = await checkRepoPermission(handle);
      setInfo(saved);
      setPermission(p);
      setStatus('idle');
    } catch (err) {
      // User-canceled picker rejects with AbortError — treat as no-op.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function regrant(): Promise<void> {
    setStatus('working');
    try {
      const handle = await loadRepoFolderHandle();
      if (handle === null) {
        setStatus({ error: 'No folder is set.' });
        return;
      }
      const p = await requestRepoPermission(handle);
      setPermission(p);
      setStatus('idle');
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function clear(): Promise<void> {
    if (!confirm('Clear the configured Test repo folder? Saves will fall back to ~/Downloads/webspec/.')) return;
    setStatus('working');
    try {
      await clearRepoFolder();
      setInfo(null);
      setPermission('unknown');
      setStatus('idle');
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="general-heading">
      <p id="general-heading" className="settings-tagline">
        Global settings that affect all webspec workflows.
      </p>

      <div className="general-field">
        <h2 className="general-field-label">Test repo folder</h2>
        <p className="general-field-hint">
          Where webspec writes your Test Cases and Queue specs. Point this at a project folder you
          own — typically a cloned (or about-to-be-cloned) team-tests repo like <code>~/code/ucm-tests</code>.
        </p>
        <p className="general-field-hint general-field-warn">
          <strong>Chrome blocks Desktop, Downloads, and Documents</strong> from being picked here.
          If you don't have a folder yet, run <code>mkdir ~/code/ucm-tests</code> in a terminal, then click below.
        </p>

        {loading ? (
          <p className="settings-empty">Loading…</p>
        ) : info === null ? (
          <div className="general-folder-row">
            <span className="general-folder-empty">No folder configured.</span>
            <button type="button" className="settings-add-btn" onClick={() => void pickFolder()}>
              Choose folder…
            </button>
          </div>
        ) : (
          <div className="general-folder-row">
            <div className="general-folder-info">
              <code className="general-folder-name">{info.name}</code>
              {permission !== 'unknown' && (
                <span className={permissionClass(permission)}>{permissionLabel(permission)}</span>
              )}
            </div>
            <div className="general-folder-actions">
              <button type="button" onClick={() => void pickFolder()}>Change…</button>
              {permission === 'prompt' && (
                <button type="button" onClick={() => void regrant()}>Re-grant access</button>
              )}
              <button
                type="button"
                className="profile-delete-btn"
                onClick={() => void clear()}
                aria-label="Clear repo folder"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="general-status-row">
          {status === 'working' && <span className="settings-status">Working…</span>}
          {typeof status === 'object' && 'error' in status && (
            <span className="settings-status settings-status-err" role="alert">{status.error}</span>
          )}
        </div>
      </div>
    </section>
  );
}

function permissionLabel(p: RepoPermission): string {
  switch (p) {
    case 'granted': return '✓ Access granted';
    case 'prompt': return '! Permission needed';
    case 'denied': return '× Access denied';
  }
}

function permissionClass(p: RepoPermission): string {
  switch (p) {
    case 'granted': return 'general-perm general-perm-ok';
    case 'prompt': return 'general-perm general-perm-warn';
    case 'denied': return 'general-perm general-perm-err';
  }
}
