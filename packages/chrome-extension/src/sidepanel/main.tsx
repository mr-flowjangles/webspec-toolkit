/**
 * v1.7.1 — side panel entry. For the scaffold patch this mounts the same
 * React app the popup mounts. The popup's CSS sets a fixed 380px width
 * that no longer applies in a side panel context; the SidePanelShell wraps
 * the existing App with a min-width that lets the side panel breathe while
 * keeping the popup's narrow-column behavior bounded for visual parity.
 *
 * v1.7.9 completes the migration: every view (Audit, Save, Settings, Queues)
 * now renders inside this one App in the side panel, and the popup HTML entry
 * is retired (no `default_popup` in the manifest). The App component still
 * lives under popup/ for git-history continuity; it's the side-panel app now.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../popup/App.js';
import '../popup/popup.css';
import './sidepanel.css';

const root = document.getElementById('root');
if (root === null) throw new Error('webspec sidepanel: #root element missing');

createRoot(root).render(
  <StrictMode>
    <div className="sidepanel-shell">
      <App />
    </div>
  </StrictMode>,
);
