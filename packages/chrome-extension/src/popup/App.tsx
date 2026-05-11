import { useState } from 'react';
import { normalizeAxeResults, renderA11yReportMarkdown } from '@webspec/core/browser';
import type { A11yReport } from '@webspec/core/browser';
import type { AuditRequest, AuditResponse } from '../shared/messages.js';
import { ReportView } from './ReportView.js';

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'report'; report: A11yReport; storageKey: string };

export function App(): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleAuditClick(): Promise<void> {
    setStatus({ kind: 'running' });
    try {
      const report = await runAuditOnActiveTab();
      const storageKey = await stashReport(report);
      setStatus({ kind: 'report', report, storageKey });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleOpenReportClick(storageKey: string): Promise<void> {
    const url = chrome.runtime.getURL(`src/report/index.html?id=${encodeURIComponent(storageKey)}`);
    await chrome.tabs.create({ url });
  }

  return (
    <main className="popup">
      <header>
        <h1>webspec</h1>
        <p className="tagline">Shift-left companion for web app development.</p>
      </header>

      <div className="actions">
        <button
          type="button"
          onClick={handleAuditClick}
          disabled={status.kind === 'running'}
        >
          {status.kind === 'running' ? 'Auditing…' : 'Audit this tab'}
        </button>
        <button type="button" disabled title="Coming after audit mode">
          Record workflow
        </button>
      </div>

      {status.kind === 'error' && (
        <p className="error" role="alert">
          {status.message}
        </p>
      )}

      {status.kind === 'report' && (
        <ReportView
          report={status.report}
          onCopy={() => copyToClipboard(renderA11yReportMarkdown(status.report))}
          onOpenFullReport={() => handleOpenReportClick(status.storageKey)}
        />
      )}

      <footer>
        <p className="meta">v0.3.8 — M5 audit mode</p>
      </footer>
    </main>
  );
}

async function runAuditOnActiveTab(): Promise<A11yReport> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error(
      'webspec only audits http(s) pages. Navigate to a regular web page and try again.',
    );
  }

  const request: AuditRequest = { type: 'audit:request' };
  let response: AuditResponse;
  try {
    response = await chrome.tabs.sendMessage<AuditRequest, AuditResponse>(tab.id, request);
  } catch (err) {
    // sendMessage rejects when no content script is loaded (e.g. tab opened
    // before the extension was installed). Tell the user how to fix it.
    throw new Error(
      err instanceof Error && /Receiving end does not exist/.test(err.message)
        ? 'Content script not loaded yet — reload the page and try again.'
        : err instanceof Error
          ? err.message
          : String(err),
    );
  }

  if (!response.ok) throw new Error(response.error);

  return normalizeAxeResults(response.results, { kind: 'url', ref: tab.url });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stash the report under a unique key in `chrome.storage.local` so the report
 * tab can read it back. Returns the key for the URL query string.
 */
async function stashReport(report: A11yReport): Promise<string> {
  const key = `report:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ [key]: report });
  return key;
}
