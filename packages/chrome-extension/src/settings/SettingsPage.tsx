/**
 * v1.3 Settings page — manage AuthProfiles.
 *
 * Profiles live in chrome.storage.local (`webspec.authProfiles` key) and are
 * matched against the active tab URL at recording-start time. Each profile
 * has a name, a glob URL pattern, and N header rows whose values support
 * `${runAs}` substitution from the recording's runAs field.
 *
 * See `docs/08-test-library.md` for the design.
 */
import { useEffect, useState } from 'react';
import type { AuthHeader, AuthProfile, AuthProfileList } from '@webspec/core/browser';
import { blankProfile, loadProfiles, saveProfiles } from '../shared/profiles.js';

type SaveStatus = 'idle' | 'saving' | 'saved' | { error: string };

export function SettingsPage(): JSX.Element {
  const [profiles, setProfiles] = useState<AuthProfileList>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const loaded = await loadProfiles();
      setProfiles(loaded);
      setLoading(false);
    })();
  }, []);

  async function persist(next: AuthProfileList): Promise<void> {
    setStatus('saving');
    try {
      await saveProfiles(next);
      setProfiles(next);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  function addProfile(): void {
    const fresh = blankProfile();
    setProfiles((cur) => [...cur, fresh]);
    setEditingId(fresh.id);
  }

  function updateProfile(id: string, patch: Partial<AuthProfile>): void {
    setProfiles((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function deleteProfile(id: string): Promise<void> {
    if (!confirm('Delete this auth profile?')) return;
    await persist(profiles.filter((p) => p.id !== id));
  }

  async function saveProfile(id: string): Promise<void> {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    if (profile.name.trim() === '' || profile.urlPattern.trim() === '') {
      setStatus({ error: 'Name and URL pattern are required.' });
      return;
    }
    // Drop empty header rows (user added a row but never filled it).
    const cleaned: AuthProfile = {
      ...profile,
      name: profile.name.trim(),
      urlPattern: profile.urlPattern.trim(),
      headers: profile.headers
        .filter((h) => h.name.trim() !== '')
        .map((h) => ({ name: h.name.trim(), value: h.value })),
    };
    await persist(profiles.map((p) => (p.id === id ? cleaned : p)));
    setEditingId(null);
  }

  return (
    <main className="settings">
      <header className="settings-head">
        <h1>webspec — Auth Profiles</h1>
        <p className="settings-tagline">
          Match a URL to a set of HTTP headers. When you record on a matching page, the
          extension bakes the resolved headers into the spec so it runs authenticated.
          Use <code>{'${runAs}'}</code> in a header value to substitute the recording's run-as user.
        </p>
      </header>

      <div className="settings-actions">
        <button type="button" className="settings-add-btn" onClick={addProfile}>
          + Add profile
        </button>
        {status === 'saving' && <span className="settings-status">Saving…</span>}
        {status === 'saved' && <span className="settings-status settings-status-ok">Saved.</span>}
        {typeof status === 'object' && 'error' in status && (
          <span className="settings-status settings-status-err" role="alert">{status.error}</span>
        )}
      </div>

      {loading ? (
        <p className="settings-empty">Loading…</p>
      ) : profiles.length === 0 ? (
        <p className="settings-empty">
          No auth profiles yet. Click <strong>Add profile</strong> to create one.
        </p>
      ) : (
        <ul className="profile-list" aria-label="Auth profiles">
          {profiles.map((profile) => (
            <li key={profile.id} className="profile-row">
              {editingId === profile.id ? (
                <ProfileEditor
                  profile={profile}
                  onChange={(patch) => updateProfile(profile.id, patch)}
                  onSave={() => void saveProfile(profile.id)}
                  onCancel={() => {
                    setEditingId(null);
                    // Reload to discard unsaved edits.
                    void loadProfiles().then(setProfiles);
                  }}
                />
              ) : (
                <ProfileSummary
                  profile={profile}
                  onEdit={() => setEditingId(profile.id)}
                  onDelete={() => void deleteProfile(profile.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

interface SummaryProps {
  profile: AuthProfile;
  onEdit: () => void;
  onDelete: () => void;
}

function ProfileSummary({ profile, onEdit, onDelete }: SummaryProps): JSX.Element {
  return (
    <div className="profile-summary">
      <div className="profile-summary-main">
        <h2 className="profile-name">{profile.name || <em>(unnamed)</em>}</h2>
        <code className="profile-url">{profile.urlPattern || <em>(no URL pattern)</em>}</code>
        <ul className="profile-headers">
          {profile.headers.length === 0 ? (
            <li><em>No headers</em></li>
          ) : (
            profile.headers.map((h, idx) => (
              <li key={idx}>
                <code>{h.name}</code> → <code>{h.value}</code>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="profile-summary-actions">
        <button type="button" onClick={onEdit}>Edit</button>
        <button type="button" className="profile-delete-btn" onClick={onDelete} aria-label="Delete profile">
          ×
        </button>
      </div>
    </div>
  );
}

interface EditorProps {
  profile: AuthProfile;
  onChange: (patch: Partial<AuthProfile>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function ProfileEditor({ profile, onChange, onSave, onCancel }: EditorProps): JSX.Element {
  function setHeader(idx: number, patch: Partial<AuthHeader>): void {
    const next = profile.headers.map((h, i) => (i === idx ? { ...h, ...patch } : h));
    onChange({ headers: next });
  }
  function addHeader(): void {
    onChange({ headers: [...profile.headers, { name: '', value: '' }] });
  }
  function removeHeader(idx: number): void {
    onChange({ headers: profile.headers.filter((_, i) => i !== idx) });
  }

  return (
    <form
      className="profile-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label>
        Name
        <input
          type="text"
          required
          value={profile.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. UCM Dev"
        />
      </label>

      <label>
        URL pattern <span className="profile-editor-hint">(glob — <code>*</code> matches anything)</span>
        <input
          type="text"
          required
          value={profile.urlPattern}
          onChange={(e) => onChange({ urlPattern: e.target.value })}
          placeholder="http://app.ucm-dev.cmscloud.local/*"
        />
      </label>

      <fieldset className="profile-headers-field">
        <legend>HTTP headers</legend>
        {profile.headers.map((h, idx) => (
          <div key={idx} className="profile-header-row">
            <input
              type="text"
              value={h.name}
              onChange={(e) => setHeader(idx, { name: e.target.value })}
              placeholder="Header name (e.g. uid)"
              aria-label={`Header ${idx + 1} name`}
            />
            <input
              type="text"
              value={h.value}
              onChange={(e) => setHeader(idx, { value: e.target.value })}
              placeholder="Value — use ${runAs} to inject the recording user"
              aria-label={`Header ${idx + 1} value`}
            />
            <button
              type="button"
              className="profile-header-remove"
              onClick={() => removeHeader(idx)}
              aria-label={`Remove header ${idx + 1}`}
              disabled={profile.headers.length === 1}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="profile-header-add" onClick={addHeader}>
          + Add header
        </button>
      </fieldset>

      <div className="profile-editor-actions">
        <button type="submit" className="profile-editor-save">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
