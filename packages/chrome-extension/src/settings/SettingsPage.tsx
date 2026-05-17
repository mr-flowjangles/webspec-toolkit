/**
 * Settings shell — hosts sibling panels (Auth Profiles, Queues).
 *
 * Each panel manages its own state and storage; this shell only owns the
 * active-tab selection. See `docs/10-team-shareability.md` for the v1.4
 * decision to make Queues a sibling section here rather than a new surface.
 */
import { useState } from 'react';
import { AuthProfilesPanel } from './AuthProfilesPanel.js';
import { GeneralPanel } from './GeneralPanel.js';
import { QueuesPanel } from './QueuesPanel.js';

type SettingsTab = 'auth' | 'queues' | 'general';

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'auth', label: 'Auth Profiles' },
  { id: 'queues', label: 'Queues' },
  { id: 'general', label: 'General' },
];

export function SettingsPage(): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('auth');

  return (
    <main className="settings">
      <header className="settings-head">
        <h1>webspec</h1>
        <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={tab === t.id ? 'settings-tab settings-tab-active' : 'settings-tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'auth' && <AuthProfilesPanel />}
        {tab === 'queues' && <QueuesPanel />}
        {tab === 'general' && <GeneralPanel />}
      </div>
    </main>
  );
}
